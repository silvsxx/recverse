/**
 * RecVerse version.dll - Windows Version API Proxy
 * 
 * This DLL acts as a proxy for the genuine Windows System32 version.dll.
 * It forwards all version API calls to the real system DLL, then loads
 * versemain.dll for RecVerse client integration.
 * 
 * Architecture: x64 only
 * 
 * Exports (matching Windows version.dll):
 * - GetFileVersionInfoA/W
 * - GetFileVersionInfoSizeA/W
 * - GetFileVersionInfoExA/W
 * - VerQueryValueA/W
 * - VerFindFileA/W
 * - VerInstallFileA/W
 * - VerLanguageNameA/W
 * - GetFileVersionInfoByHandle
 * - DllGetVersion
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <versionhelpers.h>
#include <strsafe.h>
#include <shlwapi.h>
#include <stdio.h>
#include <stdlib.h>

#pragma comment(lib, "shlwapi.lib")

// ============================================================
// CONFIGURATION
// ============================================================

// Name of our main integration DLL
#define VERSEMAIN_DLL_NAME L"versemain.dll"

// RecVerse initialization function in versemain.dll
typedef void (*RecVerseInitFn)(void);
typedef void (*RecVerseShutdownFn)(void);

// ============================================================
// GLOBAL STATE
// ============================================================

static HMODULE g_hRealVersionDll = NULL;
static HMODULE g_hVerseMainDll = NULL;
static void (*g_pfnRecVerseInit)(void) = NULL;
static void (*g_pfnRecVerseShutdown)(void) = NULL;
static BOOL g_bInitialized = FALSE;
static CRITICAL_SECTION g_csInit;

// ============================================================
// LOGGING (OutputDebugString for native debugging)
// ============================================================

#define RECVERSE_LOG(fmt, ...) do { \
    wchar_t buf[1024]; \
    StringCchPrintfW(buf, ARRAYSIZE(buf), L"[RecVerse version.dll] " fmt L"\n", __VA_ARGS__); \
    OutputDebugStringW(buf); \
} while(0)

#define RECVERSE_LOG_ERROR(fmt, ...) do { \
    wchar_t buf[1024]; \
    StringCchPrintfW(buf, ARRAYSIZE(buf), L"[RecVerse version.dll ERROR] " fmt L"\n", __VA_ARGS__); \
    OutputDebugStringW(buf); \
} while(0)

// ============================================================
// HELPER: Load real system version.dll
// ============================================================

static HMODULE LoadRealVersionDll()
{
    wchar_t systemPath[MAX_PATH];
    UINT len = GetSystemDirectoryW(systemPath, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) {
        RECVERSE_LOG_ERROR(L"Failed to get system directory");
        return NULL;
    }

    // Append version.dll
    if (FAILED(StringCchCatW(systemPath, MAX_PATH, L"\\version.dll"))) {
        RECVERSE_LOG_ERROR(L"Path too long");
        return NULL;
    }

    // Load with LOAD_LIBRARY_SEARCH_SYSTEM32 to prevent DLL hijacking
    HMODULE hMod = LoadLibraryExW(systemPath, NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!hMod) {
        DWORD err = GetLastError();
        RECVERSE_LOG_ERROR(L"Failed to load real version.dll from %s (error %lu)", systemPath, err);
        return NULL;
    }

    RECVERSE_LOG(L"Loaded real version.dll from %s", systemPath);
    return hMod;
}

// ============================================================
// HELPER: Load versemain.dll
// ============================================================

static HMODULE LoadVerseMainDll()
{
    // Get the directory of this DLL (version.dll)
    wchar_t dllPath[MAX_PATH];
    DWORD len = GetModuleFileNameW(GetModuleHandleW(L"version.dll"), dllPath, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) {
        RECVERSE_LOG_ERROR(L"Failed to get version.dll path");
        return NULL;
    }

    // Find last backslash to get directory
    wchar_t* lastSlash = wcsrchr(dllPath, L'\\');
    if (!lastSlash) {
        RECVERSE_LOG_ERROR(L"Invalid version.dll path");
        return NULL;
    }

    // Replace filename with versemain.dll
    *++lastSlash = L'\0';
    if (FAILED(StringCchCatW(dllPath, MAX_PATH, VERSEMAIN_DLL_NAME))) {
        RECVERSE_LOG_ERROR(L"Path too long for versemain.dll");
        return NULL;
    }

    // Load versemain.dll
    HMODULE hMod = LoadLibraryExW(dllPath, NULL, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!hMod) {
        DWORD err = GetLastError();
        RECVERSE_LOG_ERROR(L"Failed to load versemain.dll from %s (error %lu)", dllPath, err);
        return NULL;
    }

    RECVERSE_LOG(L"Loaded versemain.dll from %s", dllPath);
    return hMod;
}

// ============================================================
// INITIALIZATION
// ============================================================

static void InitializeProxy()
{
    EnterCriticalSection(&g_csInit);

    if (g_bInitialized) {
        LeaveCriticalSection(&g_csInit);
        return;
    }

    RECVERSE_LOG(L"Initializing RecVerse version.dll proxy");

    // 1. Load real version.dll
    g_hRealVersionDll = LoadRealVersionDll();
    if (!g_hRealVersionDll) {
        RECVERSE_LOG_ERROR(L"Failed to load real version.dll - proxy will not function correctly");
        LeaveCriticalSection(&g_csInit);
        return;
    }

    // 2. Load versemain.dll
    g_hVerseMainDll = LoadVerseMainDll();
    if (g_hVerseMainDll) {
        // Get RecVerse initialization function
        g_pfnRecVerseInit = (void(*)())GetProcAddress(g_hVerseMainDll, "RecVerseInitialize");
        g_pfnRecVerseShutdown = (void(*)())GetProcAddress(g_hVerseMainDll, "RecVerseShutdown");

        if (g_pfnRecVerseInit) {
            RECVERSE_LOG(L"Found RecVerseInitialize in versemain.dll");
            // Call initialization
            __try {
                g_pfnRecVerseInit();
                RECVERSE_LOG(L"RecVerseInitialize completed");
            }
            __except (EXCEPTION_EXECUTE_HANDLER) {
                DWORD code = GetExceptionCode();
                RECVERSE_LOG_ERROR(L"RecVerseInitialize crashed (0x%08X)", code);
            }
        } else {
            RECVERSE_LOG_ERROR(L"RecVerseInitialize not found in versemain.dll");
        }

        if (g_pfnRecVerseShutdown) {
            RECVERSE_LOG(L"Found RecVerseShutdown in versemain.dll");
        }
    } else {
        RECVERSE_LOG_ERROR(L"versemain.dll not found - RecVerse integration disabled");
    }

    g_bInitialized = TRUE;
    LeaveCriticalSection(&g_csInit);
}

static void CleanupProxy()
{
    EnterCriticalSection(&g_csInit);

    if (!g_bInitialized) {
        LeaveCriticalSection(&g_csInit);
        return;
    }

    RECVERSE_LOG(L"Shutting down RecVerse version.dll proxy");

    // Call RecVerse shutdown
    if (g_pfnRecVerseShutdown) {
        __try {
            g_pfnRecVerseShutdown();
            RECVERSE_LOG(L"RecVerseShutdown completed");
        }
        __except (EXCEPTION_EXECUTE_HANDLER) {
            DWORD code = GetExceptionCode();
            RECVERSE_LOG_ERROR(L"RecVerseShutdown crashed (0x%08X)", code);
        }
    }

    // Free versemain.dll
    if (g_hVerseMainDll) {
        FreeLibrary(g_hVerseMainDll);
        g_hVerseMainDll = NULL;
    }

    // Free real version.dll
    if (g_hRealVersionDll) {
        FreeLibrary(g_hRealVersionDll);
        g_hRealVersionDll = NULL;
    }

    g_bInitialized = FALSE;
    LeaveCriticalSection(&g_csInit);
}

// ============================================================
// HELPER: Forward function pointer retrieval
// ============================================================

static FARPROC GetRealProc(const char* name)
{
    InitializeProxy();
    if (!g_hRealVersionDll) return NULL;

    FARPROC pfn = GetProcAddress(g_hRealVersionDll, name);
    return pfn;
}

// ============================================================
// EXPORTED FUNCTIONS (matching Windows version.dll exactly)
// ============================================================

// Export via linker pragma to avoid redefinition conflicts with Windows SDK headers
#pragma comment(linker, "/export:GetFileVersionInfoA")
#pragma comment(linker, "/export:GetFileVersionInfoW")
#pragma comment(linker, "/export:GetFileVersionInfoSizeA")
#pragma comment(linker, "/export:GetFileVersionInfoSizeW")
#pragma comment(linker, "/export:GetFileVersionInfoExW")
#pragma comment(linker, "/export:GetFileVersionInfoByHandle")
#pragma comment(linker, "/export:VerQueryValueA")
#pragma comment(linker, "/export:VerQueryValueW")
#pragma comment(linker, "/export:VerFindFileA")
#pragma comment(linker, "/export:VerFindFileW")
#pragma comment(linker, "/export:VerInstallFileA")
#pragma comment(linker, "/export:VerInstallFileW")
#pragma comment(linker, "/export:VerLanguageNameA")
#pragma comment(linker, "/export:VerLanguageNameW")
#pragma comment(linker, "/export:DllGetVersion")
#pragma comment(linker, "/export:VerSetConditionMask")

extern "C" {

// GetFileVersionInfoSizeA
DWORD WINAPI GetFileVersionInfoSizeA(LPCSTR lptstrFilename, LPDWORD lpdwHandle)
{
    static DWORD (WINAPI *pfn)(LPCSTR, LPDWORD) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(LPCSTR, LPDWORD))GetRealProc("GetFileVersionInfoSizeA");
    return pfn ? pfn(lptstrFilename, lpdwHandle) : 0;
}

// GetFileVersionInfoSizeW
DWORD WINAPI GetFileVersionInfoSizeW(LPCWSTR lptstrFilename, LPDWORD lpdwHandle)
{
    static DWORD (WINAPI *pfn)(LPCWSTR, LPDWORD) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(LPCWSTR, LPDWORD))GetRealProc("GetFileVersionInfoSizeW");
    return pfn ? pfn(lptstrFilename, lpdwHandle) : 0;
}

// GetFileVersionInfoA
BOOL WINAPI GetFileVersionInfoA(LPCSTR lptstrFilename, DWORD dwHandle, DWORD dwLen, LPVOID lpData)
{
    static BOOL (WINAPI *pfn)(LPCSTR, DWORD, DWORD, LPVOID) = NULL;
    if (!pfn) pfn = (BOOL (WINAPI*)(LPCSTR, DWORD, DWORD, LPVOID))GetRealProc("GetFileVersionInfoA");
    return pfn ? pfn(lptstrFilename, dwHandle, dwLen, lpData) : FALSE;
}

// GetFileVersionInfoW
BOOL WINAPI GetFileVersionInfoW(LPCWSTR lptstrFilename, DWORD dwHandle, DWORD dwLen, LPVOID lpData)
{
    static BOOL (WINAPI *pfn)(LPCWSTR, DWORD, DWORD, LPVOID) = NULL;
    if (!pfn) pfn = (BOOL (WINAPI*)(LPCWSTR, DWORD, DWORD, LPVOID))GetRealProc("GetFileVersionInfoW");
    return pfn ? pfn(lptstrFilename, dwHandle, dwLen, lpData) : FALSE;
}

// GetFileVersionInfoExW (Windows 10+)
BOOL WINAPI GetFileVersionInfoExW(DWORD dwFlags, LPCWSTR lptstrFilename, DWORD dwHandle, DWORD dwLen, LPVOID lpData)
{
    static BOOL (WINAPI *pfn)(DWORD, LPCWSTR, DWORD, DWORD, LPVOID) = NULL;
    if (!pfn) pfn = (BOOL (WINAPI*)(DWORD, LPCWSTR, DWORD, DWORD, LPVOID))GetRealProc("GetFileVersionInfoExW");
    return pfn ? pfn(dwFlags, lptstrFilename, dwHandle, dwLen, lpData) : FALSE;
}

// VerQueryValueA
BOOL WINAPI VerQueryValueA(LPCVOID pBlock, LPCSTR lpSubBlock, LPVOID* lplpBuffer, PUINT puLen)
{
    static BOOL (WINAPI *pfn)(LPCVOID, LPCSTR, LPVOID*, PUINT) = NULL;
    if (!pfn) pfn = (BOOL (WINAPI*)(LPCVOID, LPCSTR, LPVOID*, PUINT))GetRealProc("VerQueryValueA");
    return pfn ? pfn(pBlock, lpSubBlock, lplpBuffer, puLen) : FALSE;
}

// VerQueryValueW
BOOL WINAPI VerQueryValueW(LPCVOID pBlock, LPCWSTR lpSubBlock, LPVOID* lplpBuffer, PUINT puLen)
{
    static BOOL (WINAPI *pfn)(LPCVOID, LPCWSTR, LPVOID*, PUINT) = NULL;
    if (!pfn) pfn = (BOOL (WINAPI*)(LPCVOID, LPCWSTR, LPVOID*, PUINT))GetRealProc("VerQueryValueW");
    return pfn ? pfn(pBlock, lpSubBlock, lplpBuffer, puLen) : FALSE;
}

// VerFindFileA
DWORD WINAPI VerFindFileA(DWORD uFlags, LPCSTR szFileName, LPCSTR szWinDir, LPCSTR szAppDir, LPSTR szCurDir, PUINT lpuCurDirLen, LPSTR szDestDir, PUINT lpuDestDirLen)
{
    static DWORD (WINAPI *pfn)(DWORD, LPCSTR, LPCSTR, LPCSTR, LPSTR, PUINT, LPSTR, PUINT) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(DWORD, LPCSTR, LPCSTR, LPCSTR, LPSTR, PUINT, LPSTR, PUINT))GetRealProc("VerFindFileA");
    return pfn ? pfn(uFlags, szFileName, szWinDir, szAppDir, szCurDir, lpuCurDirLen, szDestDir, lpuDestDirLen) : 0;
}

// VerFindFileW
DWORD WINAPI VerFindFileW(DWORD uFlags, LPCWSTR szFileName, LPCWSTR szWinDir, LPCWSTR szAppDir, LPWSTR szCurDir, PUINT lpuCurDirLen, LPWSTR szDestDir, PUINT lpuDestDirLen)
{
    static DWORD (WINAPI *pfn)(DWORD, LPCWSTR, LPCWSTR, LPCWSTR, LPWSTR, PUINT, LPWSTR, PUINT) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(DWORD, LPCWSTR, LPCWSTR, LPCWSTR, LPWSTR, PUINT, LPWSTR, PUINT))GetRealProc("VerFindFileW");
    return pfn ? pfn(uFlags, szFileName, szWinDir, szAppDir, szCurDir, lpuCurDirLen, szDestDir, lpuDestDirLen) : 0;
}

// VerInstallFileA
DWORD WINAPI VerInstallFileA(DWORD uFlags, LPCSTR szSrcFileName, LPCSTR szDestFileName, LPCSTR szSrcDir, LPCSTR szDestDir, LPCSTR szCurDir, LPSTR szTmpFile, PUINT lpuTmpFileLen)
{
    static DWORD (WINAPI *pfn)(DWORD, LPCSTR, LPCSTR, LPCSTR, LPCSTR, LPCSTR, LPSTR, PUINT) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(DWORD, LPCSTR, LPCSTR, LPCSTR, LPCSTR, LPCSTR, LPSTR, PUINT))GetRealProc("VerInstallFileA");
    return pfn ? pfn(uFlags, szSrcFileName, szDestFileName, szSrcDir, szDestDir, szCurDir, szTmpFile, lpuTmpFileLen) : 0;
}

// VerInstallFileW
DWORD WINAPI VerInstallFileW(DWORD uFlags, LPCWSTR szSrcFileName, LPCWSTR szDestFileName, LPCWSTR szSrcDir, LPCWSTR szDestDir, LPCWSTR szCurDir, LPWSTR szTmpFile, PUINT lpuTmpFileLen)
{
    static DWORD (WINAPI *pfn)(DWORD, LPCWSTR, LPCWSTR, LPCWSTR, LPCWSTR, LPCWSTR, LPWSTR, PUINT) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(DWORD, LPCWSTR, LPCWSTR, LPCWSTR, LPCWSTR, LPCWSTR, LPWSTR, PUINT))GetRealProc("VerInstallFileW");
    return pfn ? pfn(uFlags, szSrcFileName, szDestFileName, szSrcDir, szDestDir, szCurDir, szTmpFile, lpuTmpFileLen) : 0;
}

// VerLanguageNameA
DWORD WINAPI VerLanguageNameA(DWORD wLang, LPSTR szLang, DWORD cchLang)
{
    static DWORD (WINAPI *pfn)(DWORD, LPSTR, DWORD) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(DWORD, LPSTR, DWORD))GetRealProc("VerLanguageNameA");
    return pfn ? pfn(wLang, szLang, cchLang) : 0;
}

// VerLanguageNameW
DWORD WINAPI VerLanguageNameW(DWORD wLang, LPWSTR szLang, DWORD cchLang)
{
    static DWORD (WINAPI *pfn)(DWORD, LPWSTR, DWORD) = NULL;
    if (!pfn) pfn = (DWORD (WINAPI*)(DWORD, LPWSTR, DWORD))GetRealProc("VerLanguageNameW");
    return pfn ? pfn(wLang, szLang, cchLang) : 0;
}

// GetFileVersionInfoByHandle (Windows 10+)
BOOL WINAPI GetFileVersionInfoByHandle(HANDLE hFile, DWORD dwHandle, DWORD dwLen, LPVOID lpData)
{
    static BOOL (WINAPI *pfn)(HANDLE, DWORD, DWORD, LPVOID) = NULL;
    if (!pfn) pfn = (BOOL (WINAPI*)(HANDLE, DWORD, DWORD, LPVOID))GetRealProc("GetFileVersionInfoByHandle");
    return pfn ? pfn(hFile, dwHandle, dwLen, lpData) : FALSE;
}

// DllGetVersion
HRESULT WINAPI DllGetVersion(DLLVERSIONINFO* pdvi)
{
    static HRESULT (WINAPI *pfn)(DLLVERSIONINFO*) = NULL;
    if (!pfn) pfn = (HRESULT (WINAPI*)(DLLVERSIONINFO*))GetRealProc("DllGetVersion");
    return pfn ? pfn(pdvi) : E_NOTIMPL;
}

// VerSetConditionMask (Windows 10+) - inline in SDK, export for compatibility
ULONGLONG WINAPI VerSetConditionMask(ULONGLONG dwlConditionMask, DWORD dwTypeBitMask, BYTE dwConditionMask)
{
    return ::VerSetConditionMask(dwlConditionMask, dwTypeBitMask, dwConditionMask);
}

} // extern "C"

// ============================================================
// DLL ENTRY POINT
// ============================================================

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        InitializeCriticalSection(&g_csInit);
        // Don't initialize here - wait for first API call
        break;

    case DLL_PROCESS_DETACH:
        if (lpReserved == NULL) {
            // Normal process detach
            // CleanupProxy(); // Optional: cleanup on detach
        }
        DeleteCriticalSection(&g_csInit);
        break;
    }
    return TRUE;
}