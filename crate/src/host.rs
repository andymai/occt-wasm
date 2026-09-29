//! Host functions for the embedded module's imports.
//!
//! `-sSTANDALONE_WASM` still leaves eight `wasi_snapshot_preview1` calls and a
//! few Emscripten runtime hooks and filesystem syscalls unresolved. OCCT links
//! them in, but the facade never needs a filesystem, an environment, or a call
//! stack, so each one gets the answer an empty sandbox would give. Output to
//! stdout and stderr is accepted and discarded.

use std::time::{SystemTime, UNIX_EPOCH};

use wasmtime::{Caller, Extern, Linker, Memory};

use crate::error::OcctResult;

const WASI: &str = "wasi_snapshot_preview1";

// WASI errno values; Emscripten's musl uses the same numbering.
const ERRNO_SUCCESS: i32 = 0;
const ERRNO_BADF: i32 = 8;
const ERRNO_NOSYS: i32 = 52;

const STDOUT: i32 = 1;
const STDERR: i32 = 2;

fn memory(caller: &mut Caller<'_, ()>) -> wasmtime::Result<Memory> {
    caller
        .get_export("memory")
        .and_then(Extern::into_memory)
        .ok_or_else(|| wasmtime::Error::msg("module has no memory export"))
}

fn read_u32(memory: Memory, caller: &Caller<'_, ()>, ptr: u32) -> wasmtime::Result<u32> {
    let mut buf = [0u8; 4];
    memory.read(caller, ptr as usize, &mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn write_bytes(
    memory: Memory,
    caller: &mut Caller<'_, ()>,
    ptr: i32,
    bytes: &[u8],
) -> wasmtime::Result<()> {
    memory.write(caller, ptr.cast_unsigned() as usize, bytes)?;
    Ok(())
}

pub(crate) fn define_imports(linker: &mut Linker<()>) -> OcctResult<()> {
    define_wasi(linker)?;
    define_env(linker)?;
    Ok(())
}

fn define_wasi(linker: &mut Linker<()>) -> OcctResult<()> {
    linker.func_wrap(WASI, "proc_exit", |code: i32| -> wasmtime::Result<()> {
        Err(wasmtime::Error::msg(format!(
            "module called proc_exit({code})"
        )))
    })?;

    // Report every byte as written so printf-style callers do not retry.
    linker.func_wrap(
        WASI,
        "fd_write",
        |mut caller: Caller<'_, ()>,
         fd: i32,
         iovs: i32,
         iovs_len: i32,
         nwritten: i32|
         -> wasmtime::Result<i32> {
            if fd != STDOUT && fd != STDERR {
                return Ok(ERRNO_BADF);
            }
            let memory = memory(&mut caller)?;
            let mut total = 0u32;
            for i in 0..iovs_len.cast_unsigned() {
                let iov = iovs.cast_unsigned() + i * 8;
                total = total.wrapping_add(read_u32(memory, &caller, iov + 4)?);
            }
            write_bytes(memory, &mut caller, nwritten, &total.to_le_bytes())?;
            Ok(ERRNO_SUCCESS)
        },
    )?;
    linker.func_wrap(WASI, "fd_read", |_: i32, _: i32, _: i32, _: i32| ERRNO_BADF)?;
    linker.func_wrap(WASI, "fd_seek", |_: i32, _: i64, _: i32, _: i32| ERRNO_BADF)?;
    linker.func_wrap(WASI, "fd_close", |_: i32| ERRNO_BADF)?;

    // An empty environment: zero variables, zero bytes.
    linker.func_wrap(
        WASI,
        "environ_sizes_get",
        |mut caller: Caller<'_, ()>, count: i32, buf_size: i32| -> wasmtime::Result<i32> {
            let memory = memory(&mut caller)?;
            write_bytes(memory, &mut caller, count, &0u32.to_le_bytes())?;
            write_bytes(memory, &mut caller, buf_size, &0u32.to_le_bytes())?;
            Ok(ERRNO_SUCCESS)
        },
    )?;
    linker.func_wrap(WASI, "environ_get", |_: i32, _: i32| ERRNO_SUCCESS)?;

    linker.func_wrap(
        WASI,
        "clock_time_get",
        |mut caller: Caller<'_, ()>,
         _clock: i32,
         _precision: i64,
         time: i32|
         -> wasmtime::Result<i32> {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| u64::try_from(d.as_nanos()).unwrap_or(u64::MAX));
            let memory = memory(&mut caller)?;
            write_bytes(memory, &mut caller, time, &nanos.to_le_bytes())?;
            Ok(ERRNO_SUCCESS)
        },
    )?;
    Ok(())
}

fn define_env(linker: &mut Linker<()>) -> OcctResult<()> {
    linker.func_wrap("env", "emscripten_notify_memory_growth", |_: i32| {})?;
    linker.func_wrap(
        "env",
        "emscripten_get_callstack",
        |_: i32, _: i32, _: i32| 0i32,
    )?;
    linker.func_wrap(
        "env",
        "emscripten_get_preloaded_image_data",
        |_: i32, _: i32, _: i32| 0i32,
    )?;
    linker.func_wrap("env", "OSD_MemInfo_getModuleHeapLength", || 0.0f64)?;
    linker.func_wrap("env", "_emscripten_lookup_name", |_: i32| 0i32)?;

    // Emscripten syscalls return a negated errno.
    linker.func_wrap(
        "env",
        "__syscall_faccessat",
        |_: i32, _: i32, _: i32, _: i32| -ERRNO_NOSYS,
    )?;
    linker.func_wrap("env", "__syscall_chmod", |_: i32, _: i32| -ERRNO_NOSYS)?;
    linker.func_wrap("env", "__syscall_getdents64", |_: i32, _: i32, _: i32| {
        -ERRNO_NOSYS
    })?;
    linker.func_wrap("env", "__syscall_unlinkat", |_: i32, _: i32, _: i32| {
        -ERRNO_NOSYS
    })?;
    linker.func_wrap("env", "__syscall_rmdir", |_: i32| -ERRNO_NOSYS)?;
    Ok(())
}
