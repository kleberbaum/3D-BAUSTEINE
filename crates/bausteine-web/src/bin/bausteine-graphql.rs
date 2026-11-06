// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-graphql: the GraphQL engine of the Web Worker on the build host, for the test notebooks.
 */

//! The GraphQL engine of the Web Worker on the build host.
//!
//! The binary boots the service as the Web Worker of the page boots it and
//! reads one GraphQL request body per line from standard input, a JSON
//! object with `query` and optionally `variables` and `operationName`. It
//! answers each with one line, the JSON text of the response body. The
//! argument `--schema` prints the schema text instead.

use std::{
    io::{
        self,
        BufRead as _,
        Write as _, //
    },
    process::ExitCode,
};

use bausteine_web::engine::Engine;

fn main() -> ExitCode {
    let engine = match Engine::boot() {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("bausteine-graphql: {error}");
            return ExitCode::from(70);
        }
    };
    let mut out = io::stdout().lock();
    if std::env::args().nth(1).as_deref() == Some("--schema") {
        let _ = out.write_all(engine.schema().as_bytes());
        return ExitCode::SUCCESS;
    }
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else {
            return ExitCode::from(74);
        };
        if line.trim().is_empty() {
            continue;
        }
        let answer = engine.answer(&line);
        if writeln!(out, "{answer}")
            .and_then(|()| out.flush())
            .is_err()
        {
            return ExitCode::from(74);
        }
    }
    ExitCode::SUCCESS
}
