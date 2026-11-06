// SPDX-License-Identifier: GPL-2.0-only
//
// bausteine-web scene.wgsl: the faces, the edges and the grid of the four views.
//
// A parallel view shades its faces lightly, like a coloured drawing of the
// GZ lesson, so its lines stay the strongest marks. The oblique view shades
// them with the light of the POV export of version 1.3. An edge that a face
// hides is drawn a second time, dashed and faint, by the pipeline whose
// override HIDDEN is true and whose depth test passes behind the faces.

override HIDDEN: bool = false;

struct FaceIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) color: vec4f,
    @location(3) item: f32,
    @location(4) selected: f32,
}

struct FaceOut {
    @builtin(position) clip: vec4f,
    @location(0) world: vec3f,
    @location(1) normal: vec3f,
    @location(2) color: vec4f,
    @location(3) selected: f32,
}

@vertex
fn face_vertex(in: FaceIn) -> FaceOut {
    var out: FaceOut;
    out.clip = camera.view_proj * vec4f(in.position, 1.0);
    out.world = in.position;
    out.normal = in.normal;
    out.color = in.color;
    out.selected = in.selected;
    return out;
}

// The light of the POV export, light_source <5, 10, -20>, in the
// coordinates of the lesson.
const LIGHT: vec3f = vec3f(20.0, 5.0, 10.0);

@fragment
fn face_fragment(in: FaceOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
    var n = normalize(in.normal);
    if !front {
        n = -n;
    }
    var color: vec3f;
    if is_parallel() {
        // A soft light from the upper left of the paper.
        let l = normalize(camera.toward.xyz * 1.4 + camera.up.xyz * 0.6 - camera.right.xyz * 0.35);
        let lambert = max(dot(n, l), 0.0);
        let paper = select(vec3f(1.0), vec3f(0.12, 0.13, 0.16), is_dark());
        let tint = mix(paper, in.color.rgb, 0.55);
        color = tint * (0.72 + 0.28 * lambert);
    } else {
        let v = normalize(camera.eye.xyz - in.world);
        let l = normalize(LIGHT - in.world);
        let h = normalize(l + v);
        let lambert = max(dot(n, l), 0.0);
        let sky = 0.5 + 0.5 * n.z;
        let ambient = mix(vec3f(0.22, 0.21, 0.2), vec3f(0.42, 0.45, 0.52), sky);
        let specular = pow(max(dot(n, h), 0.0), 48.0) * 0.35;
        color = in.color.rgb * (ambient + 0.75 * lambert) + vec3f(specular);
    }
    if in.selected > 0.5 {
        color = mix(color, selection_color(), 0.28);
    }
    return vec4f(color, in.color.a);
}

struct LineIn {
    @location(0) position: vec3f,
    @location(1) other: vec3f,
    @location(2) style: f32,
    @location(3) color: f32,
}

struct LineOut {
    @builtin(position) clip: vec4f,
    @location(0) @interpolate(flat) style: u32,
    @location(1) along: f32,
    @location(2) @interpolate(flat) color: vec3f,
}

// Returns the position of the clip space point `clip` in pixels of the viewport.
fn to_pixels(clip: vec4f) -> vec2f {
    let ndc = clip.xy / max(abs(clip.w), 1e-6);
    return (ndc * vec2f(0.5, -0.5) + 0.5) * camera.viewport.zw;
}

@vertex
fn line_vertex(in: LineIn) -> LineOut {
    var out: LineOut;
    var clip = camera.view_proj * vec4f(in.position, 1.0);
    let other = camera.view_proj * vec4f(in.other, 1.0);
    let here = to_pixels(clip);
    let there = to_pixels(other);
    let d = abs(there - here);
    // The dashes run along the screen axis the segment follows most, so the
    // many short segments of an outline continue one pattern.
    out.along = select(here.y, here.x, d.x >= d.y);
    // Lift the line a little towards the viewer off the faces it borders.
    clip.z = clip.z - 0.0008 * clip.w;
    out.clip = clip;
    out.style = u32(in.style + 0.5);
    // The colour of a wire of the classic look, packed as 0xRRGGBB.
    let packed = u32(round(in.color));
    out.color = vec3f(f32((packed >> 16u) & 255u), f32((packed >> 8u) & 255u), f32(packed & 255u)) / 255.0;
    return out;
}

// Returns the colour of a line of the style `style`.
fn line_color(style: u32) -> vec4f {
    let dark = is_dark();
    switch style {
        case 0u: {
            return select(vec4f(0.10, 0.13, 0.17, 1.0), vec4f(0.88, 0.91, 0.95, 1.0), dark);
        }
        case 1u: {
            return vec4f(selection_color(), 1.0);
        }
        case 2u: {
            return select(vec4f(0.45, 0.50, 0.57, 0.9), vec4f(0.62, 0.67, 0.74, 0.9), dark);
        }
        case 3u: {
            return select(vec4f(0.0, 0.0, 0.0, 0.06), vec4f(1.0, 1.0, 1.0, 0.05), dark);
        }
        case 4u: {
            return select(vec4f(0.0, 0.0, 0.0, 0.15), vec4f(1.0, 1.0, 1.0, 0.13), dark);
        }
        case 5u: {
            return select(vec4f(0.86, 0.19, 0.19, 0.9), vec4f(1.0, 0.42, 0.42, 0.9), dark);
        }
        case 6u: {
            return select(vec4f(0.18, 0.62, 0.27, 0.9), vec4f(0.41, 0.86, 0.48, 0.9), dark);
        }
        default: {
            return select(vec4f(0.10, 0.44, 0.76, 0.9), vec4f(0.35, 0.68, 1.0, 0.9), dark);
        }
    }
}

@fragment
fn line_fragment(in: LineOut) -> @location(0) vec4f {
    if in.style >= 8u {
        // The wires and the raster of the classic look draw solid in their own colour.
        return vec4f(ink(in.color), 1.0);
    }
    var color = line_color(in.style);
    // A dash and its gap span nine CSS pixels whatever the density of the screen.
    let dashed = fract(in.along / (9.0 * camera.params.z)) > 0.55;
    if HIDDEN {
        // Hidden edges are dashed and faint, the convention of the lesson.
        if dashed || in.style >= 3u {
            discard;
        }
        color.a = color.a * 0.45;
    } else if in.style == 2u && dashed {
        discard;
    }
    return color;
}

struct BackgroundOut {
    @builtin(position) clip: vec4f,
}

@vertex
fn background_vertex(@builtin(vertex_index) index: u32) -> BackgroundOut {
    let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    var out: BackgroundOut;
    out.clip = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
    return out;
}

@fragment
fn background_fragment(in: BackgroundOut) -> @location(0) vec4f {
    return camera.background;
}
