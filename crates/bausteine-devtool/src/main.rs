// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-devtool: one primitive of the geometry per subcommand, for the test notebooks.
 */

//! One primitive of the geometry of 3D-Bausteine per subcommand.
//!
//! The test notebooks under `tests/notebooks/` reach the geometry through
//! this binary, one primitive at a time, as the notebooks of Aosabi reach
//! its engine through `aosabi-devtool`. A scene travels as its packed
//! numbers, see `bausteine_core::packed`, separated by commas, and the
//! argument `-` reads them from standard input. Every answer is one line of
//! JSON on standard output, and a wrong call answers its error on standard
//! error with the exit code 2.
//!
//! | Subcommand | Answers |
//! | --- | --- |
//! | `examples` | The keys and the titles of the examples |
//! | `example <key>` | The items of an example and their packed numbers |
//! | `decode <packed>` | The items of a packed scene after the tree is repaired |
//! | `mesh <code> [hole]` | The counts of the polygon model of a unit body |
//! | `matrix <packed> <index>` | The matrix of an item in the scene, by columns |
//! | `role <packed> <index>` | Whether an item adds or cuts material, and its depth |
//! | `pov <packed> [eye] [target]` | The scene file of POV-Ray, each point as `x,y,z` |
//! | `project <view> <x> <y> <z> [w] [h]` | The pixel of a point in a view |
//! | `unproject <view> <x> <y> [w] [h]` | The point under a pixel of a parallel view |
//! | `lines <packed> <view> [w] [h]` | The segments of the edges of a view with their styles |
//! | `grid <view> [w] [h]` | The segments of the grid of a view with their styles |
//! | `faces <packed>` | The counts of the face vertices |
//! | `pick <packed> <view> <x> <y> [w] [h]` | The item under a pixel, or -1 |
//! | `program <packed>` | The nodes of the program of the ray tracer |
//! | `textures` | Every texture with its group and material |
//! | `classic-raster <view> [w] [h]` | The marks and the dots of the raster of the classic look |
//! | `classic-wires <packed> <view> [w] [h]` | The wires of the classic look with their colours |
//!
//! The views are numbered as `View::ALL`: 0 the front view, 1 the side view,
//! 2 the top view and 3 the oblique view. The parallel views use the default
//! centre and scale, and the oblique view the default orbit, unless the
//! variables `BAUSTEINE_ORTHO=x,y,z,ppu` and `BAUSTEINE_ORBIT=x,y,z,yaw,pitch,distance`
//! say otherwise. `BAUSTEINE_CAVALIER=zoom` gives the oblique view the
//! cavalier projection of version 1.3 at the 3D zoom `zoom`, and
//! `BAUSTEINE_TURN=x,y,z` turns the oblique view as the tab Kamera does.

use std::{env, fmt::Write as _, io::Read as _, process::ExitCode};

use bausteine_core::{
    body::Body,
    classic,
    drawing::{
        self,
        Drawing,
        FACE_STRIDE,
        LINE_STRIDE, //
    },
    examples,
    math::Vec3,
    mesh::UnitMesh,
    packed, pov,
    raytrace::{
        self,
        NODE_STRIDE, //
    },
    scene::{
        Role,
        Scene, //
    },
    texture::TEXTURES,
    view::{
        Camera,
        Orbit,
        Ortho,
        View, //
    },
};

/// The width of a viewport when a call names none.
const WIDTH: f32 = 400.0;
/// The height of a viewport when a call names none.
const HEIGHT: f32 = 300.0;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match run(&args) {
        Ok(out) => {
            println!("{out}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("bausteine-devtool: {error}");
            ExitCode::from(2)
        }
    }
}

/// Runs the subcommand of `args` and returns its answer.
fn run(args: &[String]) -> Result<String, String> {
    let command = args.first().map_or("", String::as_str);
    let rest = &args[args.len().min(1)..];
    match command {
        "examples" => Ok(list_examples()),
        "example" => example(arg(rest, 0)?),
        "decode" => Ok(items_json(&scene(arg(rest, 0)?)?)),
        "mesh" => mesh(rest),
        "matrix" => matrix(rest),
        "role" => role(rest),
        "pov" => export(rest),
        "project" => project(rest),
        "unproject" => unproject(rest),
        "lines" => lines(rest),
        "grid" => grid(rest),
        "faces" => faces(rest),
        "pick" => pick(rest),
        "program" => program(rest),
        "textures" => Ok(textures()),
        "classic-raster" => classic_raster(rest),
        "classic-wires" => classic_wires(rest),
        _ => Err(format!(
            "unknown subcommand `{command}`, see the doc comment of main.rs"
        )),
    }
}

/// Returns the argument `index` of `rest`.
fn arg(rest: &[String], index: usize) -> Result<&str, String> {
    rest.get(index)
        .map(String::as_str)
        .ok_or_else(|| format!("argument {} is missing", index + 1))
}

/// Returns the number of the argument `index`, or `default` where it is missing.
fn number(rest: &[String], index: usize, default: f32) -> Result<f32, String> {
    match rest.get(index) {
        None => Ok(default),
        Some(text) => text
            .parse()
            .map_err(|_| format!("argument {} is no number: `{text}`", index + 1)),
    }
}

/// Returns the numbers of a list separated by commas.
fn numbers(text: &str) -> Result<Vec<f32>, String> {
    let text = if text == "-" {
        let mut input = String::new();
        std::io::stdin()
            .read_to_string(&mut input)
            .map_err(|e| e.to_string())?;
        input
    } else {
        String::from(text)
    };
    text.split([',', ' ', '\n', '\t'])
        .filter(|part| !part.is_empty())
        .map(|part| part.parse().map_err(|_| format!("no number: `{part}`")))
        .collect()
}

/// Returns the scene of the packed numbers of `text`.
fn scene(text: &str) -> Result<Scene, String> {
    let values = numbers(text)?;
    if values.len() % packed::ITEM_STRIDE != 0 {
        return Err(format!(
            "{} numbers are no whole number of items of {}",
            values.len(),
            packed::ITEM_STRIDE
        ));
    }
    Ok(packed::decode(&values))
}

/// Returns the point of `x,y,z`.
fn point(text: &str) -> Result<Vec3, String> {
    let v = numbers(text)?;
    match v.as_slice() {
        [x, y, z] => Ok(Vec3::new(*x, *y, *z)),
        _ => Err(format!("a point has three coordinates: `{text}`")),
    }
}

/// Returns `value` as a JSON number, null where it is not finite.
fn json_number(value: f32) -> String {
    if value.is_finite() {
        let rounded = (f64::from(value) * 1e5).round() / 1e5;
        format!("{rounded}")
    } else {
        String::from("null")
    }
}

/// Returns `values` as a JSON array of numbers.
fn json_numbers(values: &[f32]) -> String {
    let inner: Vec<String> = values.iter().map(|v| json_number(*v)).collect();
    format!("[{}]", inner.join(","))
}

/// Returns `text` as a JSON string.
fn json_string(text: &str) -> String {
    let mut out = String::from("\"");
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Returns the items of `scene` as JSON.
fn items_json(scene: &Scene) -> String {
    let items: Vec<String> = scene
        .items
        .iter()
        .map(|item| {
            format!(
                "{{\"name\":{},\"code\":{},\"parent\":{},\"position\":{},\"size\":{},\"rotation\":{},\"color\":{},\"texture\":{},\"inner\":{},\"source\":{}}}",
                json_string(&item.name),
                item.kind.code(),
                item.parent.map_or_else(|| String::from("null"), |p| p.to_string()),
                json_numbers(&item.position.to_array()),
                json_numbers(&item.size.to_array()),
                json_numbers(&item.rotation.to_array()),
                json_numbers(&item.color),
                item.texture
                    .and_then(|t| TEXTURES.get(t))
                    .map_or_else(|| String::from("null"), |t| json_string(t.name)),
                json_number(item.inner_radius),
                item.source.map_or_else(|| String::from("null"), |s| s.to_string()),
            )
        })
        .collect();
    format!("{{\"items\":[{}]}}", items.join(","))
}

fn list_examples() -> String {
    let entries: Vec<String> = examples::EXAMPLES
        .iter()
        .map(|(key, title)| {
            format!(
                "{{\"key\":{},\"title\":{}}}",
                json_string(key),
                json_string(title)
            )
        })
        .collect();
    format!("[{}]", entries.join(","))
}

fn example(key: &str) -> Result<String, String> {
    let scene = examples::example(key).ok_or_else(|| format!("no example `{key}`"))?;
    let items = items_json(&scene);
    Ok(format!(
        "{},\"packed\":{}}}",
        &items[..items.len() - 1],
        json_numbers(&packed::encode(&scene))
    ))
}

fn mesh(rest: &[String]) -> Result<String, String> {
    let code = number(rest, 0, 0.0)? as u32;
    let body = Body::from_code(code).ok_or_else(|| format!("no body of the code {code}"))?;
    let hole = number(rest, 1, 0.0)?;
    let mesh = UnitMesh::of(body, hole);
    let borders = mesh.edges.iter().filter(|e| e.right.is_none()).count();
    let mut lo = Vec3::new(f32::MAX, f32::MAX, f32::MAX);
    let mut hi = Vec3::new(f32::MIN, f32::MIN, f32::MIN);
    for p in &mesh.positions {
        lo = Vec3::new(lo.x.min(p.x), lo.y.min(p.y), lo.z.min(p.z));
        hi = Vec3::new(hi.x.max(p.x), hi.y.max(p.y), hi.z.max(p.z));
    }
    Ok(format!(
        "{{\"body\":{},\"points\":{},\"triangles\":{},\"edges\":{},\"borders\":{},\"min\":{},\"max\":{}}}",
        json_string(body.label()),
        mesh.positions.len(),
        mesh.triangles.len(),
        mesh.edges.len(),
        borders,
        json_numbers(&lo.to_array()),
        json_numbers(&hi.to_array()),
    ))
}

/// Returns the item of index `index` of `rest`, checked against `scene`.
fn index(rest: &[String], at: usize, scene: &Scene) -> Result<usize, String> {
    let i = number(rest, at, -1.0)?;
    if i < 0.0 || i as usize >= scene.items.len() {
        return Err(format!("no item {i}"));
    }
    Ok(i as usize)
}

fn matrix(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let i = index(rest, 1, &scene)?;
    Ok(json_numbers(&scene.world_matrix(i).to_array()))
}

fn role(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let i = index(rest, 1, &scene)?;
    let role = match scene.role(i) {
        Role::Solid => "solid",
        Role::Cutter => "cutter",
    };
    Ok(format!(
        "{{\"role\":\"{role}\",\"depth\":{},\"parent\":{}}}",
        scene.depth(i),
        scene
            .parent_of(i)
            .map_or_else(|| String::from("null"), |p| p.to_string())
    ))
}

fn export(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let mut shot = pov::Shot::default();
    if let Some(eye) = rest.get(1) {
        shot.eye = point(eye)?;
    }
    if let Some(target) = rest.get(2) {
        shot.target = point(target)?;
    }
    Ok(json_string(&pov::export(&scene, &shot)))
}

/// Returns the view of the argument `at`.
fn view(rest: &[String], at: usize) -> Result<View, String> {
    let i = number(rest, at, -1.0)?;
    View::from_index(i as u32)
        .filter(|_| i >= 0.0)
        .ok_or_else(|| format!("no view {i}, the views are 0 to 3"))
}

/// Returns the numbers of the variable `name`, or `None` where it is unset.
fn variable(name: &str, count: usize) -> Result<Option<Vec<f32>>, String> {
    match env::var(name) {
        Err(_) => Ok(None),
        Ok(text) => {
            let v = numbers(&text)?;
            if v.len() == count {
                Ok(Some(v))
            } else {
                Err(format!("{name} takes {count} numbers"))
            }
        }
    }
}

/// Returns the camera of `view` in a viewport of `width` by `height`.
fn camera(view: View, width: f32, height: f32) -> Result<Camera, String> {
    let turn = variable("BAUSTEINE_TURN", 3)?.map_or(Vec3::ZERO, |v| Vec3::new(v[0], v[1], v[2]));
    if view == View::Oblique {
        if let Some(v) = variable("BAUSTEINE_CAVALIER", 1)? {
            return Ok(Camera::cavalier(v[0], width, height).turned(turn));
        }
        let mut orbit = Orbit::default();
        if let Some(v) = variable("BAUSTEINE_ORBIT", 6)? {
            orbit = Orbit {
                target: Vec3::new(v[0], v[1], v[2]),
                yaw: v[3],
                pitch: v[4],
                distance: v[5],
            };
        }
        return Ok(Camera::oblique(&orbit, width, height).turned(turn));
    }
    let mut ortho = Ortho::default();
    if let Some(v) = variable("BAUSTEINE_ORTHO", 4)? {
        ortho = Ortho {
            center: Vec3::new(v[0], v[1], v[2]),
            pixels_per_unit: v[3],
        };
    }
    Camera::parallel(view, &ortho, width, height).ok_or_else(|| String::from("no camera"))
}

fn project(rest: &[String]) -> Result<String, String> {
    let view = view(rest, 0)?;
    let p = Vec3::new(
        number(rest, 1, 0.0)?,
        number(rest, 2, 0.0)?,
        number(rest, 3, 0.0)?,
    );
    let camera = camera(view, number(rest, 4, WIDTH)?, number(rest, 5, HEIGHT)?)?;
    Ok(camera
        .project(p)
        .map_or_else(|| String::from("null"), |(x, y)| json_numbers(&[x, y])))
}

fn unproject(rest: &[String]) -> Result<String, String> {
    let view = view(rest, 0)?;
    let (x, y) = (number(rest, 1, 0.0)?, number(rest, 2, 0.0)?);
    let camera = camera(view, number(rest, 3, WIDTH)?, number(rest, 4, HEIGHT)?)?;
    if !camera.parallel {
        return Err(String::from("the oblique view has no point under a pixel"));
    }
    let (origin, _) = camera.ray(x, y).ok_or_else(|| String::from("no ray"))?;
    let mut out = origin.to_array();
    for (i, axis) in [Vec3::X, Vec3::Y, Vec3::Z].into_iter().enumerate() {
        if axis.dot(camera.toward).abs() > 0.5 {
            out[i] = f32::NAN;
        }
    }
    Ok(json_numbers(&out))
}

/// Returns the segments of line vertices `values` with their counts per style.
fn segments(values: &[f32]) -> String {
    let mut counts = [0usize; 8];
    let mut list = Vec::new();
    for pair in values.chunks_exact(LINE_STRIDE * 2) {
        let style = pair[6] as usize;
        if let Some(count) = counts.get_mut(style) {
            *count += 1;
        }
        list.push(json_numbers(&[
            pair[0], pair[1], pair[2], pair[3], pair[4], pair[5], pair[6],
        ]));
    }
    let names = [
        "edge", "selected", "cutter", "minor", "major", "axis_x", "axis_y", "axis_z",
    ];
    let styles: Vec<String> = names
        .iter()
        .zip(counts)
        .map(|(name, count)| format!("\"{name}\":{count}"))
        .collect();
    format!(
        "{{\"count\":{},\"styles\":{{{}}},\"segments\":[{}]}}",
        list.len(),
        styles.join(","),
        list.join(",")
    )
}

fn lines(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let view = view(rest, 1)?;
    let camera = camera(view, number(rest, 2, WIDTH)?, number(rest, 3, HEIGHT)?)?;
    let mut drawing = Drawing::new();
    drawing.set_scene(&scene);
    Ok(segments(&drawing.lines(&camera, None)))
}

fn grid(rest: &[String]) -> Result<String, String> {
    let view = view(rest, 0)?;
    let camera = camera(view, number(rest, 1, WIDTH)?, number(rest, 2, HEIGHT)?)?;
    Ok(segments(&drawing::grid(&camera)))
}

fn faces(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let mut drawing = Drawing::new();
    drawing.set_scene(&scene);
    let values = drawing.faces(None);
    let vertices = values.len() / FACE_STRIDE;
    let mut items: Vec<usize> = values
        .chunks_exact(FACE_STRIDE)
        .map(|v| v[10] as usize)
        .collect();
    items.dedup();
    items.sort_unstable();
    items.dedup();
    let bounds = drawing.bounds().map_or_else(
        || String::from("null"),
        |(lo, hi)| json_numbers(&[lo.x, lo.y, lo.z, hi.x, hi.y, hi.z]),
    );
    Ok(format!(
        "{{\"vertices\":{vertices},\"triangles\":{},\"items\":{:?},\"bounds\":{bounds}}}",
        vertices / 3,
        items
    ))
}

fn pick(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let view = view(rest, 1)?;
    let (x, y) = (number(rest, 2, 0.0)?, number(rest, 3, 0.0)?);
    let camera = camera(view, number(rest, 4, WIDTH)?, number(rest, 5, HEIGHT)?)?;
    let mut drawing = Drawing::new();
    drawing.set_scene(&scene);
    Ok(drawing
        .pick(&camera, x, y)
        .map_or(-1, |i| i as i64)
        .to_string())
}

fn program(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let (nodes, count) = raytrace::program(&scene, None);
    let codes: Vec<String> = nodes
        .chunks_exact(NODE_STRIDE)
        .map(|n| (n[0] as u32).to_string())
        .collect();
    let list: Vec<String> = nodes.chunks_exact(NODE_STRIDE).map(json_numbers).collect();
    Ok(format!(
        "{{\"count\":{count},\"codes\":[{}],\"nodes\":[{}]}}",
        codes.join(","),
        list.join(",")
    ))
}

fn textures() -> String {
    let list: Vec<String> = TEXTURES
        .iter()
        .enumerate()
        .map(|(i, t)| {
            format!(
                "{{\"index\":{i},\"name\":{},\"group\":{},\"surface\":{},\"base\":{},\"accent\":{},\"reflection\":{}}}",
                json_string(t.name),
                json_string(t.group),
                t.material.surface.code(),
                json_numbers(&t.material.base),
                json_numbers(&t.material.accent),
                json_number(t.material.reflection),
            )
        })
        .collect();
    format!("[{}]", list.join(","))
}

fn classic_raster(rest: &[String]) -> Result<String, String> {
    let view = view(rest, 0)?;
    let camera = camera(view, number(rest, 1, WIDTH)?, number(rest, 2, HEIGHT)?)?;
    let (lines, dots) = classic::raster(&camera);
    Ok(format!(
        "{{\"lines\":{},\"dots\":{}}}",
        colored(&lines),
        dots.len() / LINE_STRIDE
    ))
}

fn classic_wires(rest: &[String]) -> Result<String, String> {
    let scene = scene(arg(rest, 0)?)?;
    let view = view(rest, 1)?;
    let camera = camera(view, number(rest, 2, WIDTH)?, number(rest, 3, HEIGHT)?)?;
    Ok(colored(&classic::wires(&scene, &camera)))
}

/// Returns the segments of the classic look with their colours as `#rrggbb`.
fn colored(values: &[f32]) -> String {
    let list: Vec<String> = values
        .chunks_exact(LINE_STRIDE * 2)
        .map(|pair| {
            format!(
                "{{\"a\":{},\"b\":{},\"style\":{},\"color\":\"#{:06x}\"}}",
                json_numbers(&pair[0..3]),
                json_numbers(&pair[3..6]),
                pair[6],
                pair[7] as u32
            )
        })
        .collect();
    format!("[{}]", list.join(","))
}
