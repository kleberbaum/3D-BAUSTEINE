// SPDX-License-Identifier: GPL-2.0-only
//
// bausteine-web common.wgsl: the camera of a view and the colours of the two
// themes, which every shader of the renderer starts with.

// The camera of one view, one slot of the uniform buffer.
struct Camera {
    view_proj: mat4x4f,
    inv_view_proj: mat4x4f,
    // The position of a perspective camera, and w = 1 for a parallel one.
    eye: vec4f,
    // The direction towards the viewer, and w the pixels one unit spans.
    toward: vec4f,
    right: vec4f,
    up: vec4f,
    // The viewport in pixels of the canvas: x, y, width and height.
    viewport: vec4f,
    // x = 1 for the dark theme, y = the nodes of the ray tracer, z = the
    // device pixels of one CSS pixel, w = 1 for the classic look and 2 for
    // the classic look drawn inverted.
    params: vec4f,
    // The colour behind the view.
    background: vec4f,
}

// One body of the program of the ray tracer, NODE_STRIDE values.
struct Node {
    // x = code, z = relative hole of a disc, w = Lipschitz factor.
    head: vec4f,
    // The base colour and the reflection.
    base: vec4f,
    // The accent colour and the code of the surface.
    accent: vec4f,
    // The inverse of the matrix of the body.
    inverse: mat4x4f,
    // x = 1 for the selected body.
    tail: vec4f,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> nodes: array<Node>;

fn is_dark() -> bool {
    return camera.params.x > 0.5;
}

fn is_classic() -> bool {
    return camera.params.w > 0.5;
}

fn is_inverted() -> bool {
    return camera.params.w > 1.5;
}

// Returns the colour `c` of the classic look as it draws, inverted for print.
fn ink(c: vec3f) -> vec3f {
    return select(c, vec3f(1.0) - c, is_inverted());
}

fn is_parallel() -> bool {
    return camera.eye.w > 0.5;
}

// The orange of a selection, the accent of the interface.
fn selection_color() -> vec3f {
    return select(vec3f(0.91, 0.35, 0.05), vec3f(1.0, 0.57, 0.17), is_dark());
}
