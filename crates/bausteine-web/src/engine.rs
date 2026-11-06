// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web engine: the GraphQL API of the service, booted inside the Web Worker.
 */

//! The GraphQL API of the service, booted inside the program that links it.
//!
//! The Web Worker of the page and the binary `bausteine-graphql` of the
//! test notebooks both boot the service through `aosabi::embed`, so the
//! notebooks judge the very engine the page talks to.

use aosabi::embed::Embedded;
use bausteine_core::scene::Scene;

/// The service of 3D-Bausteine with its GraphQL API.
pub struct Engine {
    /// The engine of Aosabi over the roots of the service.
    embedded: Embedded,
}

impl Engine {
    /// Boots the service.
    ///
    /// # Errors
    ///
    /// Returns the text of the failure of the boot, which a schema that does
    /// not fit the roots of the service causes.
    pub fn boot() -> Result<Self, String> {
        let embedded = Embedded::boot(bausteine::__aosabi::entry, aosabi::embed_output!())?;
        Ok(Self { embedded })
    }

    /// Answers the GraphQL request of the JSON body `body` with the JSON text
    /// of its response body.
    #[must_use]
    pub fn answer(&self, body: &str) -> String {
        self.embedded.answer(body)
    }

    /// Returns the schema text of the API.
    #[must_use]
    pub fn schema(&self) -> &'static str {
        self.embedded.schema()
    }

    /// Returns the scene `id` with its revision and the ids of its items, or
    /// `None` where the service keeps no such scene.
    #[must_use]
    pub fn snapshot(&self, id: &str) -> Option<(i32, Scene, Vec<String>)> {
        bausteine::snapshot(id)
    }
}
