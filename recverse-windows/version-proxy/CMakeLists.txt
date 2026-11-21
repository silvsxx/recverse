# RecVerse version.dll - CMake Build Configuration
# Builds the version.dll proxy for x64

cmake_minimum_required(VERSION 3.20)
project(RecVerseVersionProxy LANGUAGES CXX)

# Require Windows
if(NOT WIN32)
    message(FATAL_ERROR "RecVerse version.dll only builds on Windows")
endif()

# Enforce x64
if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "RecVerse version.dll requires x64 architecture")
endif()

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build configuration
set(CMAKE_CONFIGURATION_TYPES "Debug;Release" CACHE STRING "" FORCE)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin/${CMAKE_BUILD_TYPE})
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin/${CMAKE_BUILD_TYPE})
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib/${CMAKE_BUILD_TYPE})

# Compiler flags
if(MSVC)
    # Warning level 4, treat warnings as errors in Release
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W4 /WX- /EHsc /MP")
    
    # Release optimizations
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /O2 /MT /GL /Gy")
    set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} /MTd /Od /Zi /RTC1")
    
    # Linker flags
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} /DYNAMICBASE /NXCOMPAT")
    set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} /DYNAMICBASE /NXCOMPAT")
    
    # Release linker optimizations
    set(CMAKE_EXE_LINKER_FLAGS_RELEASE "${CMAKE_EXE_LINKER_FLAGS_RELEASE} /OPT:REF /OPT:ICF /LTCG")
    set(CMAKE_SHARED_LINKER_FLAGS_RELEASE "${CMAKE_SHARED_LINKER_FLAGS_RELEASE} /OPT:REF /OPT:ICF /LTCG")
endif()

# Version info
set(VERSION_MAJOR 1)
set(VERSION_MINOR 0)
set(VERSION_PATCH 0)
set(VERSION_TWEAK 0)
set(RECVERSE_VERSION "${VERSION_MAJOR}.${VERSION_MINOR}.${VERSION_PATCH}.${VERSION_TWEAK}")

# Source files
set(SOURCES
    version_proxy.cpp
)

# Headers
set(HEADERS
)

# Create the DLL
add_library(version_proxy SHARED ${SOURCES} ${HEADERS})

# Set output name to version.dll
set_target_properties(version_proxy PROPERTIES
    OUTPUT_NAME "version"
    PREFIX ""
    SUFFIX ".dll"
    VERSION ${RECVERSE_VERSION}
    SOVERSION ${VERSION_MAJOR}
    DEBUG_POSTFIX ""
)

# Link with required Windows libraries
target_link_libraries(version_proxy PRIVATE
    kernel32.lib
    user32.lib
    version.lib
    advapi32.lib
)

# Windows-specific settings
target_compile_definitions(version_proxy PRIVATE
    WIN32_LEAN_AND_MEAN
    _WIN32_WINNT=0x0A00  # Windows 10
    UNICODE
    _UNICODE
)

# PDB output
if(MSVC)
    target_link_options(version_proxy PRIVATE
        /DEBUG:FULL
        /PDB:${CMAKE_BINARY_DIR}/bin/${CMAKE_BUILD_TYPE}/version.pdb
    )
endif()

# Installation
install(TARGETS version_proxy
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

# Custom target for easy building
add_custom_target(version_dll ALL DEPENDS version_proxy)

# Print configuration
message(STATUS "RecVerse version.dll proxy")
message(STATUS "  Version: ${RECVERSE_VERSION}")
message(STATUS "  Architecture: x64")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  Output: ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/version.dll")