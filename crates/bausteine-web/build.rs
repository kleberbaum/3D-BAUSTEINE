// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web build.rs: takes the schema the build of the service wrote.
 */

//! Takes the schema and the type resolution that `cargo aosabi build` wrote
//! for the service into `OUT_DIR`, where `aosabi::embed_output!` reads them.

fn main() -> std::process::ExitCode {
    aosabi_build::take_artifacts("../../service/target/aosabi")
}
