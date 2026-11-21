# RecVerse versemain.dll - CMake Build Configuration
cmake_minimum_required(VERSION 3.20)
project(RecVerseVerseMain LANGUAGES CXX)

if(NOT WIN32)
    message(FATAL_ERROR "RecVerse versemain.dll only builds on Windows")
endif()
if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "RecVerse versemain.dll requires x64 architecture")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_CONFIGURATION_TYPES "Debug;Release" CACHE STRING "" FORCE)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin/${CMAKE_BUILD_TYPE})
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin/${CMAKE_BUILD_TYPE})

if(MSVC)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W4 /WX- /EHsc /MP")
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /O2 /MT /GL /Gy")
endif()

set(VERSION_MAJOR 1)
set(VERSION_MINOR 0)
set(VERSION_PATCH 0)
set(RECVERSE_VERSION "${VERSION_MAJOR}.${VERSION_MINOR}.${VERSION_PATCH}")

set(SOURCES versemain.cpp)

add_library(versemain SHARED ${SOURCES})

set_target_properties(versemain PROPERTIES
    OUTPUT_NAME "versemain"
    PREFIX ""
    SUFFIX ".dll"
    VERSION ${RECVERSE_VERSION}
    SOVERSION ${VERSION_MAJOR}
    DEBUG_POSTFIX ""
)

target_link_libraries(versemain PRIVATE
    kernel32.lib user32.lib ws2_32.lib version.lib
)

target_compile_definitions(versemain PRIVATE
    WIN32_LEAN_AND_MEAN
    _WIN32_WINNT=0x0A00
    UNICODE _UNICODE
)

if(MSVC)
    target_link_options(versemain PRIVATE /DEBUG:FULL /PDB:${CMAKE_BINARY_DIR}/bin/${CMAKE_BUILD_TYPE}/versemain.pdb)
endif()

install(TARGETS versemain RUNTIME DESTINATION bin LIBRARY DESTINATION lib)

add_custom_target(versemain_dll ALL DEPENDS versemain)

message(STATUS "RecVerse versemain.dll v${RECVERSE_VERSION} x64")