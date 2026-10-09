"""Small Windows global keyboard trace utility for diagnosing Alt+Tab timing.

It uses WH_KEYBOARD_LL, so it records keys even while another application has
focus. The trace is intentionally separate from MyMarkText and is never used
by the packaged application.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from pathlib import Path
import sys
import time


WH_KEYBOARD_LL = 13
HC_ACTION = 0
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
LLKHF_EXTENDED = 0x01

VK_NAMES = {
    0x09: "Tab",
    0x10: "Shift",
    0x11: "Ctrl",
    0x12: "Alt",
    0x1B: "Escape",
    0x20: "Space",
    0x5B: "LeftWin",
    0x5C: "RightWin",
    0xA0: "LeftShift",
    0xA1: "RightShift",
    0xA2: "LeftCtrl",
    0xA3: "RightCtrl",
    0xA4: "LeftAlt",
    0xA5: "RightAlt",
}


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", wintypes.DWORD),
        ("scanCode", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

LowLevelKeyboardProc = ctypes.WINFUNCTYPE(
    ctypes.c_long,
    ctypes.c_int,
    wintypes.WPARAM,
    wintypes.LPARAM,
)

user32.SetWindowsHookExW.argtypes = [ctypes.c_int, LowLevelKeyboardProc, wintypes.HINSTANCE, wintypes.DWORD]
user32.SetWindowsHookExW.restype = wintypes.HHOOK
user32.CallNextHookEx.argtypes = [wintypes.HHOOK, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
user32.CallNextHookEx.restype = ctypes.c_long
user32.UnhookWindowsHookEx.argtypes = [wintypes.HHOOK]
user32.UnhookWindowsHookEx.restype = wintypes.BOOL
user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
user32.GetMessageW.restype = ctypes.c_int
user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
user32.DispatchMessageW.restype = wintypes.LPARAM
user32.PostQuitMessage.argtypes = [ctypes.c_int]
kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
# Without this explicit pointer-sized result, ctypes defaults to a 32-bit int
# and truncates the module address on 64-bit Windows. SetWindowsHookExW then
# reports WinError 126 (module not found).
kernel32.GetModuleHandleW.restype = wintypes.HMODULE


def key_name(vk_code: int) -> str:
    """Return a readable key label without relying on the active keyboard IME."""
    if vk_code in VK_NAMES:
        return VK_NAMES[vk_code]
    if 0x30 <= vk_code <= 0x39 or 0x41 <= vk_code <= 0x5A:
        return chr(vk_code)
    if 0x70 <= vk_code <= 0x87:
        return f"F{vk_code - 0x6F}"
    return f"VK_0x{vk_code:02X}"


def main() -> int:
    trace_path = Path(__file__).with_name("keyboard_event_trace.log")
    start = time.perf_counter()
    previous_event = start
    pressed_at: dict[int, float] = {}

    with trace_path.open("w", encoding="utf-8", newline="\n") as log:
        def write(line: str) -> None:
            print(line, flush=True)
            log.write(line + "\n")
            log.flush()

        write("Keyboard trace started. Record one Alt+Tab reproduction, then press F12 to stop.")
        write(f"Log file: {trace_path}")
        write("Columns: elapsed time | interval since previous event | event | key | virtual key | scan code | hold duration")

        @LowLevelKeyboardProc
        def keyboard_proc(n_code: int, w_param: int, l_param: int) -> int:
            nonlocal previous_event
            if n_code == HC_ACTION:
                data = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                now = time.perf_counter()
                interval_ms = (now - previous_event) * 1000
                elapsed_ms = (now - start) * 1000
                previous_event = now

                is_down = w_param in (WM_KEYDOWN, WM_SYSKEYDOWN)
                is_up = w_param in (WM_KEYUP, WM_SYSKEYUP)
                if is_down or is_up:
                    event_name = "DOWN" if is_down else "UP  "
                    hold = ""
                    if is_down:
                        pressed_at[data.vkCode] = now
                    else:
                        down_at = pressed_at.pop(data.vkCode, None)
                        if down_at is not None:
                            hold = f" | held {((now - down_at) * 1000):7.2f} ms"

                    extended = " extended" if data.flags & LLKHF_EXTENDED else ""
                    write(
                        f"+{elapsed_ms:10.2f} ms | Δ {interval_ms:7.2f} ms | "
                        f"{event_name} | {key_name(data.vkCode):12} | "
                        f"vk=0x{data.vkCode:02X} scan=0x{data.scanCode:02X}{extended}{hold}"
                    )
                    if is_up and data.vkCode == 0x7B:  # F12
                        write("Keyboard trace stopped by F12.")
                        user32.PostQuitMessage(0)

            return user32.CallNextHookEx(None, n_code, w_param, l_param)

        hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, keyboard_proc, kernel32.GetModuleHandleW(None), 0)
        if not hook:
            raise ctypes.WinError(ctypes.get_last_error())

        try:
            message = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                user32.TranslateMessage(ctypes.byref(message))
                user32.DispatchMessageW(ctypes.byref(message))
        except KeyboardInterrupt:
            write("Keyboard trace stopped by Ctrl+C.")
        finally:
            user32.UnhookWindowsHookEx(hook)

    return 0


if __name__ == "__main__":
    sys.exit(main())
