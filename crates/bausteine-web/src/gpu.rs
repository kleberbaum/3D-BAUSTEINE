// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web gpu: the device, the pipelines and the buffers of WebGPU.
 */

//! The device, the pipelines and the buffers of WebGPU.
//!
//! The canvas holds the four views side by side, each drawn into its own
//! viewport in one render pass. The modern look draws with four samples per
//! pixel, so the thin lines of a technical drawing keep smooth edges. A
//! parallel view draws its grid, its faces, its hidden edges and its visible
//! edges. The oblique view draws the same, or the ray tracer in their place.
//!
//! The classic look draws whole pixels with one sample each, straight into
//! the surface and without a depth buffer, as the drawing methods of Visual
//! Basic drew into the picture boxes of version 1.3. A dot of its raster is
//! then one white pixel, as `PSet` set it, and an axis or a wire is a hard
//! line one pixel wide, as `Line` drew it, where the samples would spread
//! them over their neighbours in shades of grey.
//!
//! The surface takes one of the two formats every canvas of WebGPU offers,
//! `rgba8unorm` or `bgra8unorm`, whichever the browser prefers. A snapshot
//! answers its pixels in the order red, green, blue and alpha whatever the
//! format, with an opaque alpha and the rows packed tightly, as `ImageData`
//! takes them.

use bausteine_core::{
    drawing::{
        FACE_STRIDE,
        LINE_STRIDE, //
    },
    raytrace::NODE_STRIDE,
};

/// The samples per pixel of the modern look.
const SAMPLES: u32 = 4;
/// The format of the depth buffer.
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
/// The bytes of one slot of the camera buffer, the alignment of a dynamic offset.
pub const CAMERA_SLOT: u64 = 256;
/// The values of the camera of one view, the struct `Camera` of common.wgsl.
pub const CAMERA_VALUES: usize = 60;

/// A failure of WebGPU, told twice: in German for the person at the page,
/// and in the words of the browser or of wgpu for the console.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Failure {
    /// What failed, in German, for the status line or the fallback text of the page.
    pub message: String,
    /// The text of the browser or of wgpu, for the console of a developer.
    pub detail: String,
}

impl Failure {
    /// Returns the failure of the German `message` with the text `detail`.
    pub fn new(message: &str, detail: impl std::fmt::Display) -> Self {
        Self {
            message: String::from(message),
            detail: detail.to_string(),
        }
    }
}

/// What one view draws in a frame.
pub struct Frame<'a> {
    /// The viewport in pixels of the canvas: x, y, width and height.
    pub viewport: [f32; 4],
    /// The values of the camera.
    pub camera: [f32; CAMERA_VALUES],
    /// Whether the ray tracer draws the view.
    pub raytrace: bool,
    /// The line vertices of the grid.
    pub grid: &'a [f32],
    /// The line vertices of the edges.
    pub lines: &'a [f32],
    /// The point vertices of the raster of the classic look.
    pub dots: &'a [f32],
    /// Whether the view draws the classic look: no faces and no hidden edges.
    /// The views of one frame share the look, and a frame with a classic
    /// view draws every view in whole pixels.
    pub classic: bool,
}

/// A vertex buffer and the number of its vertices.
struct Mesh {
    /// The buffer.
    buffer: wgpu::Buffer,
    /// The vertices it holds.
    count: u32,
}

/// The state of WebGPU.
pub struct Gpu {
    /// The instance, which the surface and the device need alive.
    _instance: wgpu::Instance,
    /// The device.
    device: wgpu::Device,
    /// The queue of the device.
    queue: wgpu::Queue,
    /// The surface of the canvas.
    surface: wgpu::Surface<'static>,
    /// The configuration of the surface.
    config: wgpu::SurfaceConfiguration,
    /// The colour target with its samples, resolved into the surface.
    color: wgpu::TextureView,
    /// The depth buffer with its samples.
    depth: wgpu::TextureView,
    /// The layout of the one bind group.
    layout: wgpu::BindGroupLayout,
    /// The bind group over the cameras and the nodes.
    bind_group: wgpu::BindGroup,
    /// The cameras of the four views, one slot each.
    cameras: wgpu::Buffer,
    /// The program of the ray tracer.
    nodes: wgpu::Buffer,
    /// The pipelines of the modern look, with four samples per pixel.
    modern: Pipelines,
    /// The pipelines of the classic look, with one sample per pixel.
    classic: ClassicPipelines,
    /// The faces of the scene, which every view shares.
    faces: Option<Mesh>,
    /// The name of the adapter as the browser tells it, often empty.
    adapter: String,
    /// The colour the canvas is cleared with.
    pub clear: wgpu::Color,
}

impl Gpu {
    /// Opens WebGPU on `canvas` at `width` by `height` pixels.
    ///
    /// # Errors
    ///
    /// Returns the failure where the browser offers no WebGPU, no adapter or
    /// no device.
    pub async fn new(
        canvas: web_sys::OffscreenCanvas,
        width: u32,
        height: u32,
    ) -> Result<Self, Failure> {
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        descriptor.backends = wgpu::Backends::BROWSER_WEBGPU;
        let instance = wgpu::Instance::new(descriptor);
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
            .map_err(|e| Failure::new("Die Zeichenfläche bietet kein WebGPU", e))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
                apply_limit_buckets: false,
            })
            .await
            .map_err(|e| Failure::new("Kein Grafikadapter für WebGPU gefunden", e))?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("bausteine"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults()
                    .using_resolution(adapter.limits()),
                ..wgpu::DeviceDescriptor::default()
            })
            .await
            .map_err(|e| Failure::new("Das Grafikgerät lässt sich nicht öffnen", e))?;
        // An error of WebGPU goes to the console, where a developer finds it,
        // and never ends the page.
        device.on_uncaptured_error(std::sync::Arc::new(|error| {
            web_sys::console::error_1(&format!("WebGPU: {error}").into());
        }));
        device.set_device_lost_callback(|reason, message| {
            web_sys::console::error_1(
                &format!("WebGPU lost the device: {reason:?} {message}").into(),
            );
        });
        let mut config = surface
            .get_default_config(&adapter, width.max(1), height.max(1))
            .ok_or_else(|| {
                Failure::new(
                    "Die Zeichenfläche passt zu keinem Grafikadapter",
                    "the surface has no configuration for the adapter",
                )
            })?;
        config.format = surface_format(&surface.get_capabilities(&adapter).formats);
        config.alpha_mode = wgpu::CompositeAlphaMode::Opaque;
        surface.configure(&device, &config);
        let layout = bind_group_layout(&device);
        let cameras = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("cameras"),
            size: CAMERA_SLOT * 4,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let nodes = node_buffer(&device, &queue, &[0.0; NODE_STRIDE]);
        let bind_group = bind_group(&device, &layout, &cameras, &nodes);
        let shaders = Shaders::new(&device, &layout);
        let modern = Pipelines::new(&shaders, &device, config.format);
        let classic = ClassicPipelines::new(&shaders, &device, config.format);
        let (color, depth) = targets(&device, &config);
        Ok(Self {
            _instance: instance,
            device,
            queue,
            surface,
            config,
            color,
            depth,
            layout,
            bind_group,
            cameras,
            nodes,
            modern,
            classic,
            faces: None,
            adapter: adapter.get_info().name,
            clear: wgpu::Color::WHITE,
        })
    }

    /// Returns the name of the adapter as the browser tells it, often empty,
    /// since a browser may keep it to itself.
    #[must_use]
    pub fn adapter(&self) -> &str {
        &self.adapter
    }

    /// Returns the size of the surface in pixels, which the snapshot has too.
    #[must_use]
    pub fn size(&self) -> (u32, u32) {
        (self.config.width, self.config.height)
    }

    /// Frees the device and with it every buffer and texture on the GPU at
    /// once, rather than when the garbage collector of the browser gets to it.
    pub fn close(self) {
        self.device.destroy();
    }

    /// Sets the size of the canvas in pixels.
    pub fn resize(&mut self, width: u32, height: u32) {
        let width = width.clamp(1, self.device.limits().max_texture_dimension_2d);
        let height = height.clamp(1, self.device.limits().max_texture_dimension_2d);
        if width == self.config.width && height == self.config.height {
            return;
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
        let (color, depth) = targets(&self.device, &self.config);
        self.color = color;
        self.depth = depth;
    }

    /// Replaces the faces of the scene with the vertices of `values`.
    pub fn set_faces(&mut self, values: &[f32]) {
        self.faces = vertex_buffer(&self.device, &self.queue, "faces", values, FACE_STRIDE);
    }

    /// Replaces the program of the ray tracer with the nodes of `values`.
    pub fn set_nodes(&mut self, values: &[f32]) {
        let values: &[f32] = if values.is_empty() {
            &[0.0; NODE_STRIDE]
        } else {
            values
        };
        let bytes = (values.len() * 4) as u64;
        if bytes > self.nodes.size() {
            self.nodes = node_buffer(&self.device, &self.queue, values);
            self.bind_group = bind_group(&self.device, &self.layout, &self.cameras, &self.nodes);
        } else {
            self.queue.write_buffer(&self.nodes, 0, &bytes_of(values));
        }
    }

    /// Draws the views of `frames` and shows the result.
    pub fn render(&mut self, frames: &[Frame<'_>]) {
        let (wgpu::CurrentSurfaceTexture::Success(frame)
        | wgpu::CurrentSurfaceTexture::Suboptimal(frame)) = self.surface.get_current_texture()
        else {
            // A lost or outdated surface is configured again and drawn by the next frame.
            self.surface.configure(&self.device, &self.config);
            return;
        };
        let target = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let encoder = self.encode(frames, &target);
        self.queue.submit([encoder.finish()]);
        self.queue.present(frame);
    }

    /// Draws the views of `frames` into a texture of its own and answers
    /// its pixels, four bytes of red, green, blue and alpha each, row by row
    /// with no gap between the rows, the alpha always 255.
    ///
    /// # Errors
    ///
    /// Returns the failure where the pixels cannot be read back.
    pub async fn snapshot(&mut self, frames: &[Frame<'_>]) -> Result<Vec<u8>, Failure> {
        const UNREADABLE: &str = "Das Bild lässt sich nicht lesen";
        let (width, height) = (self.config.width, self.config.height);
        let format = self.config.format;
        let texel = format.block_copy_size(None).unwrap_or(4);
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("snapshot"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let row = (width * texel).next_multiple_of(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("snapshot"),
            size: u64::from(row) * u64::from(height),
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut encoder = self.encode(frames, &view);
        encoder.copy_texture_to_buffer(
            texture.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit([encoder.finish()]);
        let slice = buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        let promise = js_sys::Promise::new(&mut |resolve, _reject| {
            let sender = sender.clone();
            slice.map_async(wgpu::MapMode::Read, move |result| {
                let _ = sender.send(result);
                let _ = resolve.call0(&wasm_bindgen::JsValue::NULL);
            });
        });
        wasm_bindgen_futures::JsFuture::from(promise)
            .await
            .map_err(|e| Failure::new(UNREADABLE, format!("{e:?}")))?;
        receiver
            .try_recv()
            .map_err(|e| Failure::new(UNREADABLE, e))?
            .map_err(|e| Failure::new(UNREADABLE, e))?;
        let mapped = slice
            .get_mapped_range()
            .map_err(|e| Failure::new(UNREADABLE, e))?;
        let out = rgba(format, &mapped, width, height, row);
        drop(mapped);
        buffer.unmap();
        texture.destroy();
        Ok(out)
    }

    /// Records the drawing of the views of `frames` into `target`.
    ///
    /// The modern look draws into the colour target of four samples and
    /// resolves it into `target`. The classic look draws into `target`
    /// itself, one sample per pixel, so a point covers the one pixel whose
    /// centre it is nearest and a line steps from pixel to pixel.
    fn encode(&self, frames: &[Frame<'_>], target: &wgpu::TextureView) -> wgpu::CommandEncoder {
        let mut slots = vec![0.0f32; (CAMERA_SLOT as usize / 4) * 4];
        for (i, view) in frames.iter().take(4).enumerate() {
            let start = i * CAMERA_SLOT as usize / 4;
            slots[start..start + CAMERA_VALUES].copy_from_slice(&view.camera);
        }
        self.queue.write_buffer(&self.cameras, 0, &bytes_of(&slots));
        let buffers: Vec<[Option<Mesh>; 3]> = frames
            .iter()
            .map(|view| {
                [
                    vertex_buffer(&self.device, &self.queue, "grid", view.grid, LINE_STRIDE),
                    vertex_buffer(&self.device, &self.queue, "lines", view.lines, LINE_STRIDE),
                    vertex_buffer(&self.device, &self.queue, "dots", view.dots, LINE_STRIDE),
                ]
            })
            .collect();
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame"),
            });
        let classic = frames.iter().any(|view| view.classic);
        let (attachment, resolve_target, store) = if classic {
            (target, None, wgpu::StoreOp::Store)
        } else {
            (&self.color, Some(target), wgpu::StoreOp::Discard)
        };
        let depth = (!classic).then_some(wgpu::RenderPassDepthStencilAttachment {
            view: &self.depth,
            depth_ops: Some(wgpu::Operations {
                load: wgpu::LoadOp::Clear(1.0),
                store: wgpu::StoreOp::Discard,
            }),
            stencil_ops: None,
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("views"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: attachment,
                    depth_slice: None,
                    resolve_target,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(self.clear),
                        store,
                    },
                })],
                depth_stencil_attachment: depth,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            for (i, (view, [grid, lines, dots])) in frames.iter().zip(&buffers).enumerate().take(4)
            {
                let Some([x, y, w, h]) = self.clip(view.viewport) else {
                    continue;
                };
                pass.set_viewport(x as f32, y as f32, w as f32, h as f32, 0.0, 1.0);
                pass.set_scissor_rect(x, y, w, h);
                pass.set_bind_group(0, &self.bind_group, &[(i as u64 * CAMERA_SLOT) as u32]);
                if classic {
                    let pipelines = &self.classic;
                    if view.raytrace {
                        pass.set_pipeline(&pipelines.ray);
                        pass.draw(0..3, 0..1);
                        continue;
                    }
                    pass.set_pipeline(&pipelines.background);
                    pass.draw(0..3, 0..1);
                    draw(&mut pass, &pipelines.dots, dots.as_ref());
                    draw(&mut pass, &pipelines.lines, grid.as_ref());
                    draw(&mut pass, &pipelines.lines, lines.as_ref());
                    continue;
                }
                let pipelines = &self.modern;
                if view.raytrace {
                    pass.set_pipeline(&pipelines.ray);
                    pass.draw(0..3, 0..1);
                    continue;
                }
                pass.set_pipeline(&pipelines.background);
                pass.draw(0..3, 0..1);
                draw(&mut pass, &pipelines.grid, grid.as_ref());
                draw(&mut pass, &pipelines.faces, self.faces.as_ref());
                draw(&mut pass, &pipelines.hidden, lines.as_ref());
                draw(&mut pass, &pipelines.visible, lines.as_ref());
            }
        }
        encoder
    }

    /// Returns the viewport `rect` cut to the canvas in whole pixels, or
    /// `None` where nothing of it remains.
    fn clip(&self, rect: [f32; 4]) -> Option<[u32; 4]> {
        let (width, height) = (self.config.width as f32, self.config.height as f32);
        let x0 = rect[0].clamp(0.0, width);
        let y0 = rect[1].clamp(0.0, height);
        let x1 = (rect[0] + rect[2]).clamp(0.0, width);
        let y1 = (rect[1] + rect[3]).clamp(0.0, height);
        let (x0, y0) = (x0.round() as u32, y0.round() as u32);
        let (x1, y1) = (x1.round() as u32, y1.round() as u32);
        (x1 > x0 && y1 > y0).then_some([x0, y0, x1 - x0, y1 - y0])
    }
}

/// Draws all of `mesh` with `pipeline`, where there is a mesh.
fn draw(pass: &mut wgpu::RenderPass<'_>, pipeline: &wgpu::RenderPipeline, mesh: Option<&Mesh>) {
    if let Some(mesh) = mesh {
        pass.set_pipeline(pipeline);
        pass.set_vertex_buffer(0, mesh.buffer.slice(..));
        pass.draw(0..mesh.count, 0..1);
    }
}

/// Returns the little endian bytes of `values`.
fn bytes_of(values: &[f32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

/// Returns the format of the surface among `formats`, the ones the canvas
/// offers with the one the browser prefers first: the first format of eight
/// bits per channel without the sRGB curve, since the shaders write the
/// colours of the screen as they are, and `rgba8unorm` where the canvas
/// names neither, which every canvas of WebGPU takes.
fn surface_format(formats: &[wgpu::TextureFormat]) -> wgpu::TextureFormat {
    formats
        .iter()
        .copied()
        .find(|f| {
            matches!(
                f,
                wgpu::TextureFormat::Rgba8Unorm | wgpu::TextureFormat::Bgra8Unorm
            )
        })
        .unwrap_or(wgpu::TextureFormat::Rgba8Unorm)
}

/// Returns the pixels of `mapped`, `width` by `height` texels of `format`
/// in rows of `row` bytes, as red, green, blue and alpha of one byte each
/// with an opaque alpha and the rows packed tightly.
///
/// The formats of eight bits per channel come as they are, with blue and
/// red swapped for `bgra8unorm`. `rgba16float` and `rgb10a2unorm`, which a
/// canvas may also take, are brought down to eight bits.
fn rgba(format: wgpu::TextureFormat, mapped: &[u8], width: u32, height: u32, row: u32) -> Vec<u8> {
    use wgpu::TextureFormat as F;
    let texel = format.block_copy_size(None).unwrap_or(4) as usize;
    let mut out = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height as usize {
        let start = y * row as usize;
        let line = &mapped[start..start + width as usize * texel];
        for px in line.chunks_exact(texel) {
            let [r, g, b] = match format {
                F::Bgra8Unorm | F::Bgra8UnormSrgb => [px[2], px[1], px[0]],
                F::Rgba16Float => [
                    unit(half(px[0], px[1])),
                    unit(half(px[2], px[3])),
                    unit(half(px[4], px[5])),
                ],
                F::Rgb10a2Unorm => {
                    let v = u32::from_le_bytes([px[0], px[1], px[2], px[3]]);
                    let ten = |shift: u32| unit(((v >> shift) & 0x3ff) as f32 / 1023.0);
                    [ten(0), ten(10), ten(20)]
                }
                _ => [px[0], px[1], px[2]],
            };
            out.extend_from_slice(&[r, g, b, 255]);
        }
    }
    out
}

/// Returns the value of the half precision float of the little endian bytes `lo` and `hi`.
fn half(lo: u8, hi: u8) -> f32 {
    let bits = u16::from_le_bytes([lo, hi]);
    let sign = if bits & 0x8000 == 0 { 1.0 } else { -1.0 };
    let exponent = i32::from((bits >> 10) & 0x1f);
    let fraction = bits & 0x3ff;
    let mantissa = f32::from(fraction);
    match exponent {
        0 => sign * mantissa * (-24.0f32).exp2(),
        31 if fraction == 0 => sign * f32::INFINITY,
        31 => f32::NAN,
        _ => sign * (1.0 + mantissa / 1024.0) * ((exponent - 15) as f32).exp2(),
    }
}

/// Returns `value` between 0 and 1 as a byte, 0 for a value that is no number.
fn unit(value: f32) -> u8 {
    if value.is_nan() {
        0
    } else {
        (value.clamp(0.0, 1.0) * 255.0).round() as u8
    }
}

/// Returns a vertex buffer over `values` of `stride` values per vertex, or
/// `None` for no vertex.
fn vertex_buffer(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    values: &[f32],
    stride: usize,
) -> Option<Mesh> {
    let count = values.len() / stride;
    if count == 0 {
        return None;
    }
    let buffer = filled(
        device,
        queue,
        label,
        &values[..count * stride],
        wgpu::BufferUsages::VERTEX,
    );
    Some(Mesh {
        buffer,
        count: count as u32,
    })
}

/// Returns a storage buffer over the nodes of `values`.
fn node_buffer(device: &wgpu::Device, queue: &wgpu::Queue, values: &[f32]) -> wgpu::Buffer {
    filled(device, queue, "nodes", values, wgpu::BufferUsages::STORAGE)
}

/// Returns a buffer of `usage` that holds `values`.
///
/// The buffer is filled through the queue rather than mapped at creation,
/// since some implementations of WebGPU map only small buffers at creation.
fn filled(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    values: &[f32],
    usage: wgpu::BufferUsages,
) -> wgpu::Buffer {
    let bytes = bytes_of(values);
    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size: (bytes.len() as u64).next_multiple_of(4).max(4),
        usage: usage | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&buffer, 0, &bytes);
    buffer
}

/// Returns the colour target and the depth buffer for the size of `config`.
fn targets(
    device: &wgpu::Device,
    config: &wgpu::SurfaceConfiguration,
) -> (wgpu::TextureView, wgpu::TextureView) {
    let make = |label, format| {
        device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d {
                    width: config.width,
                    height: config.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: SAMPLES,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            })
            .create_view(&wgpu::TextureViewDescriptor::default())
    };
    (make("color", config.format), make("depth", DEPTH_FORMAT))
}

/// Returns the layout of the cameras, with a dynamic offset, and the nodes.
fn bind_group_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
    device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("views"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: true,
                    min_binding_size: wgpu::BufferSize::new((CAMERA_VALUES * 4) as u64),
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    })
}

/// Returns the bind group over `cameras` and `nodes`.
fn bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    cameras: &wgpu::Buffer,
    nodes: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("views"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: cameras,
                    offset: 0,
                    size: wgpu::BufferSize::new((CAMERA_VALUES * 4) as u64),
                }),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: nodes.as_entire_binding(),
            },
        ],
    })
}

/// The shader modules and the pipeline layout every pipeline is built from.
struct Shaders {
    /// The faces, the edges, the grid, the raster and the background.
    scene: wgpu::ShaderModule,
    /// The ray tracer.
    ray: wgpu::ShaderModule,
    /// The layout of the pipelines, over the one bind group.
    layout: wgpu::PipelineLayout,
}

impl Shaders {
    /// Compiles the shaders over the bind group of `layout`.
    fn new(device: &wgpu::Device, layout: &wgpu::BindGroupLayout) -> Self {
        let common = include_str!("shaders/common.wgsl");
        let scene = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("scene"),
            source: wgpu::ShaderSource::Wgsl(
                format!("{common}\n{}", include_str!("shaders/scene.wgsl")).into(),
            ),
        });
        let ray = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("raytrace"),
            source: wgpu::ShaderSource::Wgsl(
                format!("{common}\n{}", include_str!("shaders/raytrace.wgsl")).into(),
            ),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("views"),
            bind_group_layouts: &[Some(layout)],
            immediate_size: 0,
        });
        Self { scene, ray, layout }
    }

    /// Returns the stage of the colour behind a view.
    fn background(&self) -> Stage<'_> {
        Stage {
            module: &self.scene,
            vertex: "background_vertex",
            fragment: "background_fragment",
            buffer: None,
            topology: wgpu::PrimitiveTopology::TriangleList,
            depth: (false, wgpu::CompareFunction::Always),
            hidden: false,
        }
    }

    /// Returns the stage of the ray tracer.
    fn ray(&self) -> Stage<'_> {
        Stage {
            module: &self.ray,
            vertex: "ray_vertex",
            fragment: "ray_fragment",
            buffer: None,
            topology: wgpu::PrimitiveTopology::TriangleList,
            depth: (false, wgpu::CompareFunction::Always),
            hidden: false,
        }
    }

    /// Returns the stage of line vertices drawn as `topology` with the depth
    /// test `depth`, the override `HIDDEN` false.
    fn lines(&self, topology: wgpu::PrimitiveTopology, depth: wgpu::CompareFunction) -> Stage<'_> {
        Stage {
            module: &self.scene,
            vertex: "line_vertex",
            fragment: "line_fragment",
            buffer: Some(wgpu::VertexBufferLayout {
                array_stride: (LINE_STRIDE * 4) as u64,
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &LINE_ATTRIBUTES,
            }),
            topology,
            depth: (false, depth),
            hidden: false,
        }
    }
}

/// The pipelines of the modern look, with four samples per pixel and the
/// depth buffer.
struct Pipelines {
    /// The faces.
    faces: wgpu::RenderPipeline,
    /// The visible edges.
    visible: wgpu::RenderPipeline,
    /// The hidden edges.
    hidden: wgpu::RenderPipeline,
    /// The grid, which no depth test hides.
    grid: wgpu::RenderPipeline,
    /// The ray tracer.
    ray: wgpu::RenderPipeline,
    /// The colour behind a view.
    background: wgpu::RenderPipeline,
}

/// The pipelines of the classic look, with one sample per pixel and no
/// depth buffer, since the classic look draws neither faces nor hidden edges.
struct ClassicPipelines {
    /// The dots of the raster, one pixel each.
    dots: wgpu::RenderPipeline,
    /// The axes, their letters, the ground of the oblique view and the
    /// wires of the bodies, hard lines one pixel wide.
    lines: wgpu::RenderPipeline,
    /// The ray tracer.
    ray: wgpu::RenderPipeline,
    /// The colour behind a view.
    background: wgpu::RenderPipeline,
}

/// The attributes of a face vertex, see [`FACE_STRIDE`].
const FACE_ATTRIBUTES: [wgpu::VertexAttribute; 5] = wgpu::vertex_attr_array![
    0 => Float32x3,
    1 => Float32x3,
    2 => Float32x4,
    3 => Float32,
    4 => Float32,
];

/// The attributes of a line vertex, see [`LINE_STRIDE`].
const LINE_ATTRIBUTES: [wgpu::VertexAttribute; 4] = wgpu::vertex_attr_array![
    0 => Float32x3,
    1 => Float32x3,
    2 => Float32,
    3 => Float32,
];

impl Pipelines {
    /// Builds the pipelines of the modern look from `shaders` for the
    /// surface `format`.
    fn new(shaders: &Shaders, device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        use wgpu::{
            CompareFunction as Test,
            PrimitiveTopology as Topology, //
        };
        let builder = Builder {
            device,
            layout: &shaders.layout,
            format,
            samples: SAMPLES,
            depth: true,
        };
        Self {
            faces: builder.build(&Stage {
                module: &shaders.scene,
                vertex: "face_vertex",
                fragment: "face_fragment",
                buffer: Some(wgpu::VertexBufferLayout {
                    array_stride: (FACE_STRIDE * 4) as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &FACE_ATTRIBUTES,
                }),
                topology: Topology::TriangleList,
                depth: (true, Test::Less),
                hidden: false,
            }),
            visible: builder.build(&shaders.lines(Topology::LineList, Test::LessEqual)),
            hidden: builder.build(&Stage {
                hidden: true,
                ..shaders.lines(Topology::LineList, Test::Greater)
            }),
            grid: builder.build(&shaders.lines(Topology::LineList, Test::Always)),
            ray: builder.build(&shaders.ray()),
            background: builder.build(&shaders.background()),
        }
    }
}

impl ClassicPipelines {
    /// Builds the pipelines of the classic look from `shaders` for the
    /// surface `format`.
    fn new(shaders: &Shaders, device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        use wgpu::{
            CompareFunction as Test,
            PrimitiveTopology as Topology, //
        };
        let builder = Builder {
            device,
            layout: &shaders.layout,
            format,
            samples: 1,
            depth: false,
        };
        Self {
            dots: builder.build(&shaders.lines(Topology::PointList, Test::Always)),
            lines: builder.build(&shaders.lines(Topology::LineList, Test::Always)),
            ray: builder.build(&shaders.ray()),
            background: builder.build(&shaders.background()),
        }
    }
}

/// What a pipeline is built from.
struct Stage<'a> {
    /// The shader module.
    module: &'a wgpu::ShaderModule,
    /// The entry of the vertex stage.
    vertex: &'a str,
    /// The entry of the fragment stage.
    fragment: &'a str,
    /// The layout of the one vertex buffer, `None` for none.
    buffer: Option<wgpu::VertexBufferLayout<'a>>,
    /// The topology of the primitives.
    topology: wgpu::PrimitiveTopology,
    /// Whether the pipeline writes the depth, and its depth test, where
    /// the pass has a depth buffer.
    depth: (bool, wgpu::CompareFunction),
    /// The value of the override `HIDDEN`.
    hidden: bool,
}

/// The parts every pipeline shares.
struct Builder<'a> {
    /// The device.
    device: &'a wgpu::Device,
    /// The layout of the pipelines.
    layout: &'a wgpu::PipelineLayout,
    /// The format of the surface.
    format: wgpu::TextureFormat,
    /// The samples per pixel of the colour target.
    samples: u32,
    /// Whether the pass has a depth buffer.
    depth: bool,
}

impl Builder<'_> {
    /// Builds the pipeline of `stage`.
    fn build(&self, stage: &Stage<'_>) -> wgpu::RenderPipeline {
        let constants = [("HIDDEN", if stage.hidden { 1.0 } else { 0.0 })];
        let uses_override = stage.fragment == "line_fragment";
        let options = wgpu::PipelineCompilationOptions {
            constants: if uses_override { &constants } else { &[] },
            ..wgpu::PipelineCompilationOptions::default()
        };
        let buffers = [stage.buffer.clone()];
        let buffers: &[Option<wgpu::VertexBufferLayout<'_>>] = if stage.buffer.is_some() {
            &buffers
        } else {
            &[]
        };
        self.device
            .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(stage.vertex),
                layout: Some(self.layout),
                vertex: wgpu::VertexState {
                    module: stage.module,
                    entry_point: Some(stage.vertex),
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                    buffers,
                },
                primitive: wgpu::PrimitiveState {
                    topology: stage.topology,
                    cull_mode: None,
                    ..wgpu::PrimitiveState::default()
                },
                depth_stencil: self.depth.then(|| wgpu::DepthStencilState {
                    format: DEPTH_FORMAT,
                    depth_write_enabled: Some(stage.depth.0),
                    depth_compare: Some(stage.depth.1),
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                }),
                multisample: wgpu::MultisampleState {
                    count: self.samples,
                    ..wgpu::MultisampleState::default()
                },
                fragment: Some(wgpu::FragmentState {
                    module: stage.module,
                    entry_point: Some(stage.fragment),
                    compilation_options: options,
                    targets: &[Some(wgpu::ColorTargetState {
                        format: self.format,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                multiview_mask: None,
                cache: None,
            })
    }
}
