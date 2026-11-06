// SPDX-License-Identifier: GPL-2.0-only
/*
 * bausteine-web gpu: the device, the pipelines and the buffers of WebGPU.
 */

//! The device, the pipelines and the buffers of WebGPU.
//!
//! The canvas holds the four views side by side, each drawn into its own
//! viewport in one render pass with four samples per pixel, so the thin
//! lines of a technical drawing keep smooth edges. A parallel view draws its
//! grid, its faces, its hidden edges and its visible edges. The oblique view
//! draws the same, or the ray tracer in their place.

use bausteine_core::{
    drawing::{
        FACE_STRIDE,
        LINE_STRIDE, //
    },
    raytrace::NODE_STRIDE,
};

/// The samples per pixel.
const SAMPLES: u32 = 4;
/// The format of the depth buffer.
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
/// The bytes of one slot of the camera buffer, the alignment of a dynamic offset.
pub const CAMERA_SLOT: u64 = 256;
/// The values of the camera of one view, the struct `Camera` of common.wgsl.
pub const CAMERA_VALUES: usize = 60;

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
    /// The pipeline of the faces.
    faces_pipeline: wgpu::RenderPipeline,
    /// The pipeline of the visible edges.
    visible_pipeline: wgpu::RenderPipeline,
    /// The pipeline of the hidden edges.
    hidden_pipeline: wgpu::RenderPipeline,
    /// The pipeline of the grid, which no depth test hides.
    grid_pipeline: wgpu::RenderPipeline,
    /// The pipeline of the ray tracer.
    ray_pipeline: wgpu::RenderPipeline,
    /// The pipeline of the points of the raster.
    dots_pipeline: wgpu::RenderPipeline,
    /// The pipeline of the colour behind a view.
    background_pipeline: wgpu::RenderPipeline,
    /// The faces of the scene, which every view shares.
    faces: Option<Mesh>,
    /// The colour the canvas is cleared with.
    pub clear: wgpu::Color,
}

impl Gpu {
    /// Opens WebGPU on `canvas` at `width` by `height` pixels.
    ///
    /// # Errors
    ///
    /// Returns the text of the failure where the browser offers no WebGPU,
    /// no adapter or no device.
    pub async fn new(
        canvas: web_sys::OffscreenCanvas,
        width: u32,
        height: u32,
    ) -> Result<Self, String> {
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        descriptor.backends = wgpu::Backends::BROWSER_WEBGPU;
        let instance = wgpu::Instance::new(descriptor);
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
            .map_err(|e| format!("Die Zeichenfläche bietet kein WebGPU: {e}"))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
                apply_limit_buckets: false,
            })
            .await
            .map_err(|e| format!("Kein Grafikadapter für WebGPU gefunden: {e}"))?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("bausteine"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults()
                    .using_resolution(adapter.limits()),
                ..wgpu::DeviceDescriptor::default()
            })
            .await
            .map_err(|e| format!("Das Grafikgerät lässt sich nicht öffnen: {e}"))?;
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
            .ok_or_else(|| String::from("Die Zeichenfläche passt zu keinem Grafikadapter"))?;
        let capabilities = surface.get_capabilities(&adapter);
        if let Some(format) = capabilities.formats.iter().find(|f| !f.is_srgb()) {
            config.format = *format;
        }
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
        let pipelines = Pipelines::new(&device, &layout, config.format);
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
            faces_pipeline: pipelines.faces,
            visible_pipeline: pipelines.visible,
            hidden_pipeline: pipelines.hidden,
            grid_pipeline: pipelines.grid,
            ray_pipeline: pipelines.ray,
            dots_pipeline: pipelines.dots,
            background_pipeline: pipelines.background,
            faces: None,
            clear: wgpu::Color::WHITE,
        })
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
    /// its pixels, four bytes of red, green, blue and alpha each, row by row.
    ///
    /// # Errors
    ///
    /// Returns the text of the failure where the pixels cannot be read back.
    pub async fn snapshot(&mut self, frames: &[Frame<'_>]) -> Result<Vec<u8>, String> {
        let (width, height) = (self.config.width, self.config.height);
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
            format: self.config.format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let row = (width * 4).next_multiple_of(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
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
            .map_err(|_| String::from("Das Bild lässt sich nicht lesen"))?;
        receiver
            .try_recv()
            .map_err(|_| String::from("Das Bild lässt sich nicht lesen"))?
            .map_err(|e| e.to_string())?;
        let bgra = matches!(
            self.config.format,
            wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Bgra8UnormSrgb
        );
        let mapped = slice.get_mapped_range().map_err(|e| e.to_string())?;
        let mut out = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height as usize {
            let start = y * row as usize;
            for px in mapped[start..start + width as usize * 4].chunks_exact(4) {
                if bgra {
                    out.extend_from_slice(&[px[2], px[1], px[0], 255]);
                } else {
                    out.extend_from_slice(&[px[0], px[1], px[2], 255]);
                }
            }
        }
        drop(mapped);
        buffer.unmap();
        Ok(out)
    }

    /// Records the drawing of the views of `frames` into `target`.
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
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("views"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.color,
                    depth_slice: None,
                    resolve_target: Some(target),
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(self.clear),
                        store: wgpu::StoreOp::Discard,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Discard,
                    }),
                    stencil_ops: None,
                }),
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
                if view.raytrace {
                    pass.set_pipeline(&self.ray_pipeline);
                    pass.draw(0..3, 0..1);
                    continue;
                }
                pass.set_pipeline(&self.background_pipeline);
                pass.draw(0..3, 0..1);
                if view.classic {
                    draw(&mut pass, &self.dots_pipeline, dots.as_ref());
                    draw(&mut pass, &self.grid_pipeline, grid.as_ref());
                    draw(&mut pass, &self.grid_pipeline, lines.as_ref());
                    continue;
                }
                draw(&mut pass, &self.grid_pipeline, grid.as_ref());
                draw(&mut pass, &self.faces_pipeline, self.faces.as_ref());
                draw(&mut pass, &self.hidden_pipeline, lines.as_ref());
                draw(&mut pass, &self.visible_pipeline, lines.as_ref());
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

/// The pipelines of the renderer.
struct Pipelines {
    /// The faces.
    faces: wgpu::RenderPipeline,
    /// The visible edges.
    visible: wgpu::RenderPipeline,
    /// The hidden edges.
    hidden: wgpu::RenderPipeline,
    /// The grid.
    grid: wgpu::RenderPipeline,
    /// The ray tracer.
    ray: wgpu::RenderPipeline,
    /// The points of the raster.
    dots: wgpu::RenderPipeline,
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
    /// Compiles the shaders and builds the pipelines for the surface `format`.
    fn new(
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        format: wgpu::TextureFormat,
    ) -> Self {
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
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("views"),
            bind_group_layouts: &[Some(layout)],
            immediate_size: 0,
        });
        let builder = Builder {
            device,
            layout: &pipeline_layout,
            format,
        };
        let face_layout = wgpu::VertexBufferLayout {
            array_stride: (FACE_STRIDE * 4) as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &FACE_ATTRIBUTES,
        };
        let line_layout = wgpu::VertexBufferLayout {
            array_stride: (LINE_STRIDE * 4) as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &LINE_ATTRIBUTES,
        };
        Self {
            faces: builder.build(&Stage {
                module: &scene,
                vertex: "face_vertex",
                fragment: "face_fragment",
                buffer: Some(face_layout),
                topology: wgpu::PrimitiveTopology::TriangleList,
                depth: (true, wgpu::CompareFunction::Less),
                hidden: false,
            }),
            visible: builder.build(&Stage {
                module: &scene,
                vertex: "line_vertex",
                fragment: "line_fragment",
                buffer: Some(line_layout.clone()),
                topology: wgpu::PrimitiveTopology::LineList,
                depth: (false, wgpu::CompareFunction::LessEqual),
                hidden: false,
            }),
            hidden: builder.build(&Stage {
                module: &scene,
                vertex: "line_vertex",
                fragment: "line_fragment",
                buffer: Some(line_layout.clone()),
                topology: wgpu::PrimitiveTopology::LineList,
                depth: (false, wgpu::CompareFunction::Greater),
                hidden: true,
            }),
            grid: builder.build(&Stage {
                module: &scene,
                vertex: "line_vertex",
                fragment: "line_fragment",
                buffer: Some(line_layout.clone()),
                topology: wgpu::PrimitiveTopology::LineList,
                depth: (false, wgpu::CompareFunction::Always),
                hidden: false,
            }),
            dots: builder.build(&Stage {
                module: &scene,
                vertex: "line_vertex",
                fragment: "line_fragment",
                buffer: Some(line_layout),
                topology: wgpu::PrimitiveTopology::PointList,
                depth: (false, wgpu::CompareFunction::Always),
                hidden: false,
            }),
            background: builder.build(&Stage {
                module: &scene,
                vertex: "background_vertex",
                fragment: "background_fragment",
                buffer: None,
                topology: wgpu::PrimitiveTopology::TriangleList,
                depth: (false, wgpu::CompareFunction::Always),
                hidden: false,
            }),
            ray: builder.build(&Stage {
                module: &ray,
                vertex: "ray_vertex",
                fragment: "ray_fragment",
                buffer: None,
                topology: wgpu::PrimitiveTopology::TriangleList,
                depth: (false, wgpu::CompareFunction::Always),
                hidden: false,
            }),
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
    /// Whether the pipeline writes the depth, and its depth test.
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
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: DEPTH_FORMAT,
                    depth_write_enabled: Some(stage.depth.0),
                    depth_compare: Some(stage.depth.1),
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                }),
                multisample: wgpu::MultisampleState {
                    count: SAMPLES,
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
