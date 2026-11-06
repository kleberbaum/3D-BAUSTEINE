// SPDX-License-Identifier: GPL-2.0-only
//
// bausteine-web raytrace.wgsl: the ray tracer of the oblique view.
//
// Version 1.3 starts POV-Ray to render the scene. This shader renders it in
// the browser by sphere tracing the distance functions of the bodies, which
// the program of bausteine-core lists in postfix order. The room is the one
// of the POV export: a checkered floor that mirrors a little, two white
// walls behind the scene, the sky and one light.

struct VertexOut {
    @builtin(position) clip: vec4f,
}

@vertex
fn ray_vertex(@builtin(vertex_index) index: u32) -> VertexOut {
    // One triangle that covers the viewport.
    let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    var out: VertexOut;
    out.clip = vec4f(uv * 2.0 - 1.0, 0.5, 1.0);
    return out;
}

const FAR: f32 = 400.0;
const LIGHT: vec3f = vec3f(20.0, 5.0, 10.0);
const MAX_STACK: u32 = 24u;

// The material of no body, the room.
const ROOM: i32 = -1;

// Returns the distance to the unit body of the code `code` from `p`.
fn unit_distance(code: u32, p: vec3f, hole: f32) -> f32 {
    switch code {
        case 1u: {
            return length(p) - 1.0;
        }
        case 2u: {
            return cone(p);
        }
        case 3u: {
            let d = vec2f(length(p.xy) - 1.0, abs(p.z - 0.5) - 0.5);
            return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
        }
        case 4u, 5u: {
            let q = abs(p - 0.5) - 0.5;
            return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
        }
        case 6u: {
            return pyramid(vec3f(p.x - 0.5, p.z, p.y - 0.5));
        }
        case 7u: {
            let d = triangle(p.xy);
            let w = vec2f(d, abs(p.z - 0.5) - 0.5);
            return min(max(w.x, w.y), 0.0) + length(max(w, vec2f(0.0)));
        }
        case 8u: {
            let r = length(p.xy);
            let ring = max(r - 1.0, hole - r);
            let w = vec2f(ring, abs(p.z) - 0.004);
            return min(max(w.x, w.y), 0.0) + length(max(w, vec2f(0.0)));
        }
        default: {
            return 1e9;
        }
    }
}

// The cone of radius one on z = 0 with its apex at z = 1, the capped cone
// of Quilez with the top radius zero.
fn cone(p: vec3f) -> f32 {
    let q = vec2f(length(p.xy), p.z - 0.5);
    let k1 = vec2f(0.0, 0.5);
    let k2 = vec2f(-1.0, 1.0);
    let ca = vec2f(q.x - min(q.x, select(0.0, 1.0, q.y < 0.0)), abs(q.y) - 0.5);
    let cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
    let s = select(1.0, -1.0, cb.x < 0.0 && ca.y < 0.0);
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

// The square pyramid of base one and height one with its apex up y, after Quilez.
fn pyramid(input: vec3f) -> f32 {
    let h = 1.0;
    let m2 = h * h + 0.25;
    var p = input;
    p = vec3f(abs(p.x), p.y, abs(p.z));
    if p.z > p.x {
        p = vec3f(p.z, p.y, p.x);
    }
    p = vec3f(p.x - 0.5, p.y, p.z - 0.5);
    let q = vec3f(p.z, h * p.y - 0.5 * p.x, h * p.x + 0.5 * p.y);
    let s = max(-q.x, 0.0);
    let t = clamp((q.y - 0.5 * p.z) / (m2 + 0.25), 0.0, 1.0);
    let a = m2 * (q.x + s) * (q.x + s) + q.y * q.y;
    let b = m2 * (q.x + 0.5 * t) * (q.x + 0.5 * t) + (q.y - m2 * t) * (q.y - m2 * t);
    let d2 = select(min(a, b), 0.0, min(q.y, -q.x * m2 - q.y * 0.5) > 0.0);
    return sqrt((d2 + q.z * q.z) / m2) * sign(max(q.z, -p.y));
}

// The triangle (0, 0), (1, 0), (0.5, 0.866) of the prism, after Quilez.
fn triangle(p: vec2f) -> f32 {
    let p0 = vec2f(0.0, 0.0);
    let p1 = vec2f(1.0, 0.0);
    let p2 = vec2f(0.5, 0.8660254);
    let e0 = p1 - p0;
    let e1 = p2 - p1;
    let e2 = p0 - p2;
    let v0 = p - p0;
    let v1 = p - p1;
    let v2 = p - p2;
    let pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
    let pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
    let pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
    let s = sign(e0.x * e2.y - e0.y * e2.x);
    let d0 = vec2f(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x));
    let d1 = vec2f(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x));
    let d2 = vec2f(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x));
    let d = min(min(d0, d1), d2);
    return -sqrt(d.x) * sign(d.y);
}

// Returns the distance to the bodies from `p` and the node of the nearest.
fn bodies(p: vec3f) -> vec2f {
    var stack: array<vec2f, MAX_STACK>;
    var top = 0u;
    let count = u32(camera.params.y + 0.5);
    for (var i = 0u; i < count; i++) {
        let node = nodes[i];
        let code = u32(node.head.x + 0.5);
        if code >= 101u {
            if top < 2u {
                continue;
            }
            let b = stack[top - 1u];
            let a = stack[top - 2u];
            top = top - 1u;
            switch code {
                case 102u: {
                    stack[top - 1u] = select(a, vec2f(-b.x, b.y), -b.x > a.x);
                }
                case 103u: {
                    stack[top - 1u] = select(a, b, b.x > a.x);
                }
                default: {
                    stack[top - 1u] = select(a, b, b.x < a.x);
                }
            }
            continue;
        }
        if top >= MAX_STACK {
            continue;
        }
        if code == 0u {
            stack[top] = vec2f(1e9, -1.0);
        } else {
            let local = (node.inverse * vec4f(p, 1.0)).xyz;
            let d = unit_distance(code, local, node.head.z) * node.head.w;
            stack[top] = vec2f(d, f32(i));
        }
        top = top + 1u;
    }
    if top == 0u {
        return vec2f(1e9, -1.0);
    }
    return stack[0];
}

// Returns whether the room shows the wall of the plane x = 0, y = 0 or the floor.
fn walls() -> vec3<bool> {
    let eye = camera.eye.xyz;
    return vec3<bool>(eye.x > 0.0, eye.y > 0.0, eye.z > 0.0);
}

// Returns the distance to the scene from `p`, and the material, ROOM for the room.
fn scene(p: vec3f) -> vec2f {
    var best = bodies(p);
    let w = walls();
    if w.z && p.z < best.x {
        best = vec2f(p.z, f32(ROOM));
    }
    if w.x && p.x < best.x {
        best = vec2f(p.x, f32(ROOM));
    }
    if w.y && p.y < best.x {
        best = vec2f(p.y, f32(ROOM));
    }
    return best;
}

fn normal_at(p: vec3f) -> vec3f {
    let e = vec2f(1.0, -1.0) * 0.0007;
    return normalize(
        e.xyy * scene(p + e.xyy).x + e.yyx * scene(p + e.yyx).x + e.yxy * scene(p + e.yxy).x + e.xxx * scene(p + e.xxx).x
    );
}

struct Hit {
    t: f32,
    material: i32,
}

fn march(origin: vec3f, direction: vec3f) -> Hit {
    var t = 0.0;
    for (var i = 0; i < 220; i++) {
        let s = scene(origin + direction * t);
        if s.x < 0.0004 * max(t, 1.0) {
            return Hit(t, i32(s.y));
        }
        t = t + s.x;
        if t > FAR {
            break;
        }
    }
    return Hit(FAR, -2);
}

// Returns the share of the light that reaches `p`, with soft shadows.
fn shadow(p: vec3f, l: vec3f, distance: f32) -> f32 {
    var light = 1.0;
    var t = 0.02;
    for (var i = 0; i < 64; i++) {
        let d = bodies(p + l * t).x;
        if d < 0.0005 {
            return 0.0;
        }
        light = min(light, 10.0 * d / t);
        t = t + clamp(d, 0.02, 0.6);
        if t > distance {
            break;
        }
    }
    return clamp(light, 0.0, 1.0);
}

fn hash(p: vec3f) -> f32 {
    let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
    return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}

fn noise(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i), hash(i + vec3f(1.0, 0.0, 0.0)), u.x),
            mix(hash(i + vec3f(0.0, 1.0, 0.0)), hash(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y),
        mix(mix(hash(i + vec3f(0.0, 0.0, 1.0)), hash(i + vec3f(1.0, 0.0, 1.0)), u.x),
            mix(hash(i + vec3f(0.0, 1.0, 1.0)), hash(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y),
        u.z);
}

fn fbm(p: vec3f) -> f32 {
    var sum = 0.0;
    var amplitude = 0.5;
    var q = p;
    for (var i = 0; i < 4; i++) {
        sum = sum + amplitude * noise(q);
        q = q * 2.03;
        amplitude = amplitude * 0.5;
    }
    return sum;
}

// Returns the colour of the surface of the node `index` at `p`.
fn albedo(index: u32, p: vec3f) -> vec3f {
    let node = nodes[index];
    let local = (node.inverse * vec4f(p, 1.0)).xyz;
    let surface = u32(node.accent.w + 0.5);
    let base = node.base.rgb;
    let accent = node.accent.rgb;
    switch surface {
        case 3u: {
            let rings = fract(length(local.xy * vec2f(1.0, 1.3)) * 7.0 + fbm(local * 3.0) * 1.6);
            return mix(base, accent, smoothstep(0.35, 0.9, rings));
        }
        case 4u: {
            let veins = abs(sin(local.x * 5.0 + local.z * 3.0 + fbm(local * 2.5) * 7.0));
            return mix(accent, base, smoothstep(0.0, 0.5, veins));
        }
        case 5u: {
            return mix(base, accent, smoothstep(0.45, 0.75, fbm(local * 9.0)));
        }
        case 6u: {
            return select(base, accent, fract((local.x + local.y + local.z * 2.0) * 2.0) > 0.5);
        }
        default: {
            return base;
        }
    }
}

fn sky(direction: vec3f) -> vec3f {
    let up = clamp(direction.z, -1.0, 1.0);
    let horizon = select(vec3f(0.80, 0.86, 0.95), vec3f(0.20, 0.23, 0.30), is_dark());
    let zenith = select(vec3f(0.25, 0.47, 0.86), vec3f(0.05, 0.07, 0.14), is_dark());
    return mix(horizon, zenith, smoothstep(0.0, 0.7, up));
}

// Returns the colour and the reflection of the room at `p`.
fn room(p: vec3f, n: vec3f) -> vec4f {
    if n.z > 0.5 {
        let checker = (i32(floor(p.x)) + i32(floor(p.y))) & 1;
        let color = select(vec3f(0.97), vec3f(0.75, 0.76, 0.78), checker == 1);
        return vec4f(color, 0.3);
    }
    return vec4f(vec3f(0.94), 0.0);
}

// Returns the light reflected at `p` from a surface of `color`.
fn shade(p: vec3f, n: vec3f, v: vec3f, color: vec3f, metal: bool) -> vec3f {
    let to_light = LIGHT - p;
    let distance = length(to_light);
    let l = to_light / distance;
    let lambert = max(dot(n, l), 0.0);
    var lit = 0.0;
    if lambert > 0.0 {
        lit = shadow(p + n * 0.003, l, distance);
    }
    let h = normalize(l + v);
    let specular = pow(max(dot(n, h), 0.0), select(40.0, 120.0, metal)) * lit;
    let ambient = 0.3 + 0.12 * n.z;
    let diffuse = select(color * (ambient + 0.85 * lambert * lit), color * (0.25 + 0.4 * lambert * lit), metal);
    let shine = select(vec3f(0.25), color, metal) * specular;
    return diffuse + shine;
}

@fragment
fn ray_fragment(in: VertexOut) -> @location(0) vec4f {
    let uv = (in.clip.xy - camera.viewport.xy) / camera.viewport.zw;
    let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    let near = camera.inv_view_proj * vec4f(ndc, 0.0, 1.0);
    let far = camera.inv_view_proj * vec4f(ndc, 1.0, 1.0);
    var origin = near.xyz / near.w;
    var direction = normalize(far.xyz / far.w - origin);

    var color = vec3f(0.0);
    var throughput = vec3f(1.0);
    for (var bounce = 0; bounce < 4; bounce++) {
        let hit = march(origin, direction);
        if hit.material == -2 {
            color = color + throughput * sky(direction);
            break;
        }
        let p = origin + direction * hit.t;
        let n = normal_at(p);
        let v = -direction;
        var surface: vec3f;
        var reflection: f32;
        var kind = 0u;
        var selected = false;
        if hit.material == ROOM {
            let r = room(p, n);
            surface = r.rgb;
            reflection = r.a;
        } else {
            let index = u32(hit.material);
            let node = nodes[index];
            surface = albedo(index, p);
            reflection = node.base.w;
            kind = u32(node.accent.w + 0.5);
            selected = node.tail.x > 0.5;
        }
        let fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        if kind == 2u {
            // Glass: the share of the mirror image comes from the sky, and
            // the ray goes on through the body, tinted by its colour.
            let mirrored = reflect(direction, n);
            let share = clamp(fresnel + reflection, 0.0, 1.0);
            color = color + throughput * share * sky(mirrored);
            color = color + throughput * shade(p, n, v, surface, true) * 0.15;
            throughput = throughput * surface * (1.0 - share);
            var t = 0.01;
            for (var i = 0; i < 80; i++) {
                let d = -bodies(p + direction * t).x;
                if d < 0.0005 {
                    break;
                }
                t = t + max(d, 0.004);
            }
            origin = p + direction * (t + 0.01);
            continue;
        }
        let metal = kind == 1u;
        var lit = shade(p, n, v, surface, metal);
        if selected {
            let rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
            lit = mix(lit, selection_color(), 0.35 * rim + 0.08);
        }
        let mirror = select(reflection * mix(fresnel, 1.0, reflection), reflection, metal);
        color = color + throughput * lit * (1.0 - mirror);
        if mirror < 0.02 {
            break;
        }
        throughput = throughput * select(vec3f(mirror), surface * mirror, metal);
        direction = reflect(direction, n);
        origin = p + n * 0.004;
    }
    // A gentle tone curve and the gamma of the screen.
    let mapped = color / (1.0 + 0.15 * color);
    return vec4f(pow(clamp(mapped, vec3f(0.0), vec3f(1.0)), vec3f(0.95)), 1.0);
}
