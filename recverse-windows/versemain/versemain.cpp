/**
 * RecVerse versemain.dll - Main Client Integration (Simplified)
 * Loaded by version.dll proxy.
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>

// ============================================================
// GLOBAL STATE
// ============================================================

static HMODULE g_hThisModule = NULL;
static HMODULE g_hRealVersionDll = NULL;
static volatile LONG g_bInitialized = 0;
static volatile LONG g_bShuttingDown = 0;
static CRITICAL_SECTION g_cs;

// ============================================================
// LOGGING
// ============================================================

static void LogDebug(const wchar_t* msg) {
    wchar_t buf[2048];
    swprintf_s(buf, L"[RecVerse versemain] %s\n", msg);
    OutputDebugStringW(buf);
}

static void LogError(const wchar_t* msg) {
    wchar_t buf[2048];
    swprintf_s(buf, L"[RecVerse versemain ERROR] %s\n", msg);
    OutputDebugStringW(buf);
}

// ============================================================
// EXPORTED FUNCTIONS
// ============================================================

extern "C" {

__declspec(dllexport) void RecVerseInitialize() {
    EnterCriticalSection(&g_cs);

    if (g_bInitialized) {
        LogDebug(L"Already initialized");
        LeaveCriticalSection(&g_cs);
        return;
    }

    LogDebug(L"RecVerse versemain.dll initializing");

    // Get DLL directory
    wchar_t dllPath[MAX_PATH];
    GetModuleFileNameW(g_hThisModule, dllPath, MAX_PATH);
    wchar_t* lastSlash = wcsrchr(dllPath, L'\\');
    if (lastSlash) *lastSlash = L'\0';

    LogDebug(L"versemain.dll loaded");

    // Load real version.dll for reference
    wchar_t sysPath[MAX_PATH];
    GetSystemDirectoryW(sysPath, MAX_PATH);
    wcscat_s(sysPath, L"\\version.dll");
    g_hRealVersionDll = LoadLibraryW(sysPath);
    if (g_hRealVersionDll) {
        LogDebug(L"Real version.dll loaded");
    } else {
        LogError(L"Failed to load real version.dll");
    }

    g_bInitialized = TRUE;
    LogDebug(L"RecVerse versemain.dll initialized");

    LeaveCriticalSection(&g_cs);
}

__declspec(dllexport) void RecVerseShutdown() {
    EnterCriticalSection(&g_cs);

    if (!g_bInitialized) {
        LeaveCriticalSection(&g_cs);
        return;
    }

    LogDebug(L"RecVerse versemain.dll shutting down");

    g_bShuttingDown = TRUE;

    if (g_hRealVersionDll) {
        FreeLibrary(g_hRealVersionDll);
        g_hRealVersionDll = NULL;
    }

    g_bInitialized = FALSE;
    LogDebug(L"RecVerse versemain.dll shutdown complete");

    LeaveCriticalSection(&g_cs);
}

} // extern "C"

// ============================================================
// DLL ENTRY POINT
// ============================================================

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        g_hThisModule = hModule;
        DisableThreadLibraryCalls(hModule);
        InitializeCriticalSection(&g_cs);
        break;
    case DLL_PROCESS_DETACH:
        if (lpReserved == NULL) {
            RecVerseShutdown();
        }
        DeleteCriticalSection(&g_cs);
        break;
    }
    return TRUE;
}