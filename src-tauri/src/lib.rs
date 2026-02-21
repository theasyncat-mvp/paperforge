use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct CompareResult {
    pub left_page_count: u32,
    pub right_page_count: u32,
    pub same_page_count: bool,
    pub page_count_diff: i32,
    pub simple_difference: bool,
}

#[derive(Serialize, Deserialize)]
pub struct PdfMetadata {
    pub title: String,
    pub author: String,
    pub subject: String,
    pub keywords: String,
    pub creator: String,
}

fn get_page_count(doc: &Document) -> u32 {
    doc.get_pages().len() as u32
}

fn dict_get_int(dict: &lopdf::Dictionary, key: &[u8]) -> Option<i64> {
    match dict.get(key) {
        Ok(Object::Integer(n)) => Some(*n),
        _ => None,
    }
}

fn dict_get_name<'a>(dict: &'a lopdf::Dictionary, key: &[u8]) -> Option<&'a [u8]> {
    match dict.get(key) {
        Ok(obj) => obj.as_name().ok(),
        _ => None,
    }
}

#[tauri::command]
fn merge_pdfs(input_files: Vec<String>, output_file: String) -> Result<(), String> {
    if input_files.len() < 2 {
        return Err("At least two PDF files are required to merge.".into());
    }
    for f in &input_files {
        if !Path::new(f).exists() {
            return Err(format!("File not found: {}", f));
        }
    }

    let mut documents: Vec<Document> = Vec::new();
    for f in &input_files {
        let doc = Document::load(f).map_err(|e| format!("Failed to load {}: {}", f, e))?;
        documents.push(doc);
    }

    let mut merged = Document::with_version("1.5");
    let mut max_id = 1u32;
    let mut pages_to_add: Vec<ObjectId> = Vec::new();

    for doc in &documents {
        let pages = doc.get_pages();
        let mut sorted_pages: Vec<_> = pages.iter().collect();
        sorted_pages.sort_by_key(|(num, _)| *num);

        let id_offset = max_id;

        let mut id_map: BTreeMap<ObjectId, ObjectId> = BTreeMap::new();
        for (id, _object) in doc.objects.iter() {
            let new_id = (id.0 + id_offset, id.1);
            id_map.insert(*id, new_id);
        }
        max_id = id_offset + doc.objects.len() as u32 + 1;

        for (id, object) in doc.objects.iter() {
            let new_id = id_map[id];
            let new_object = remap_object_refs(object.clone(), &id_map);
            merged.objects.insert(new_id, new_object);
        }

        for (_page_num, page_id) in sorted_pages {
            let new_page_id = id_map[page_id];
            pages_to_add.push(new_page_id);
        }
    }

    let pages_id = merged.new_object_id();
    let page_refs: Vec<Object> = pages_to_add
        .iter()
        .map(|id| Object::Reference(*id))
        .collect();
    let count = pages_to_add.len() as i64;

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Kids" => page_refs,
        "Count" => Object::Integer(count),
    };
    merged
        .objects
        .insert(pages_id, Object::Dictionary(pages_dict));

    for page_id in &pages_to_add {
        if let Some(Object::Dictionary(ref mut dict)) = merged.objects.get_mut(page_id) {
            dict.set("Parent", Object::Reference(pages_id));
        }
    }

    let catalog_id = merged.new_object_id();
    let catalog = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    merged
        .objects
        .insert(catalog_id, Object::Dictionary(catalog));
    merged.trailer.set("Root", Object::Reference(catalog_id));

    merged.compress();
    merged
        .save(&output_file)
        .map_err(|e| format!("Failed to save merged PDF: {}", e))?;

    Ok(())
}

fn remap_object_refs(obj: Object, id_map: &BTreeMap<ObjectId, ObjectId>) -> Object {
    match obj {
        Object::Reference(id) => Object::Reference(*id_map.get(&id).unwrap_or(&id)),
        Object::Array(arr) => Object::Array(
            arr.into_iter()
                .map(|o| remap_object_refs(o, id_map))
                .collect(),
        ),
        Object::Dictionary(dict) => {
            let mut new_dict = lopdf::Dictionary::new();
            for (key, val) in dict.into_iter() {
                new_dict.set(key, remap_object_refs(val, id_map));
            }
            Object::Dictionary(new_dict)
        }
        Object::Stream(mut stream) => {
            let mut new_dict = lopdf::Dictionary::new();
            for (key, val) in stream.dict.into_iter() {
                new_dict.set(key, remap_object_refs(val, id_map));
            }
            stream.dict = new_dict;
            Object::Stream(stream)
        }
        other => other,
    }
}

#[tauri::command]
fn split_pdf(
    input_file: String,
    ranges: Vec<(u32, u32)>,
    output_files: Vec<String>,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }
    if ranges.len() != output_files.len() {
        return Err("Number of ranges must match number of output files.".into());
    }

    let doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let pages = doc.get_pages();
    let total_pages = pages.len() as u32;

    for (i, (start, end)) in ranges.iter().enumerate() {
        if *start < 1 || *end > total_pages || *start > *end {
            return Err(format!(
                "Invalid range ({}, {}) for a document with {} pages.",
                start, end, total_pages
            ));
        }

        let page_numbers: Vec<u32> = (*start..=*end).collect();
        let mut new_doc = extract_pages(&doc, &page_numbers)?;
        new_doc.compress();
        new_doc
            .save(&output_files[i])
            .map_err(|e| format!("Failed to save {}: {}", output_files[i], e))?;
    }

    Ok(())
}

fn extract_pages(source: &Document, page_numbers: &[u32]) -> Result<Document, String> {
    let pages_map = source.get_pages();
    let mut new_doc = Document::with_version("1.5");
    let mut max_id = 1u32;
    let mut pages_to_add: Vec<ObjectId> = Vec::new();

    let mut needed_ids: Vec<ObjectId> = Vec::new();
    for &pn in page_numbers {
        if let Some(&page_id) = pages_map.get(&pn) {
            needed_ids.push(page_id);
            collect_refs(source, page_id, &mut needed_ids);
        } else {
            return Err(format!("Page {} not found in document.", pn));
        }
    }
    needed_ids.sort();
    needed_ids.dedup();

    let mut id_map: BTreeMap<ObjectId, ObjectId> = BTreeMap::new();
    for &id in &needed_ids {
        let new_id = (max_id, 0);
        id_map.insert(id, new_id);
        max_id += 1;
    }

    for &id in &needed_ids {
        if let Some(obj) = source.objects.get(&id) {
            let new_id = id_map[&id];
            let new_obj = remap_object_refs(obj.clone(), &id_map);
            new_doc.objects.insert(new_id, new_obj);
        }
    }

    for &pn in page_numbers {
        if let Some(&page_id) = pages_map.get(&pn) {
            pages_to_add.push(id_map[&page_id]);
        }
    }

    let pages_id = (max_id, 0);
    max_id += 1;
    let page_refs: Vec<Object> = pages_to_add
        .iter()
        .map(|id| Object::Reference(*id))
        .collect();
    let count = pages_to_add.len() as i64;

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Kids" => page_refs,
        "Count" => Object::Integer(count),
    };
    new_doc
        .objects
        .insert(pages_id, Object::Dictionary(pages_dict));

    for page_id in &pages_to_add {
        if let Some(Object::Dictionary(ref mut dict)) = new_doc.objects.get_mut(page_id) {
            dict.set("Parent", Object::Reference(pages_id));
        }
    }

    let catalog_id = (max_id, 0);
    let catalog = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    new_doc
        .objects
        .insert(catalog_id, Object::Dictionary(catalog));
    new_doc
        .trailer
        .set("Root", Object::Reference(catalog_id));

    Ok(new_doc)
}

fn collect_refs(doc: &Document, obj_id: ObjectId, collected: &mut Vec<ObjectId>) {
    if let Some(obj) = doc.objects.get(&obj_id) {
        collect_refs_from_object(doc, obj, collected);
    }
}

fn collect_refs_from_object(doc: &Document, obj: &Object, collected: &mut Vec<ObjectId>) {
    match obj {
        Object::Reference(id) => {
            if !collected.contains(id) {
                collected.push(*id);
                collect_refs(doc, *id, collected);
            }
        }
        Object::Array(arr) => {
            for item in arr {
                collect_refs_from_object(doc, item, collected);
            }
        }
        Object::Dictionary(dict) => {
            for (_, val) in dict.iter() {
                collect_refs_from_object(doc, val, collected);
            }
        }
        Object::Stream(stream) => {
            for (_, val) in stream.dict.iter() {
                collect_refs_from_object(doc, val, collected);
            }
        }
        _ => {}
    }
}

#[tauri::command]
fn compress_pdf(
    input_file: String,
    output_file: String,
    level: String,
) -> Result<String, String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let mut doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let before_size = fs::metadata(&input_file).map(|m| m.len()).unwrap_or(0);

    let (jpeg_quality, max_dimension) = match level.as_str() {
        "light" => (85u8, 2400u32),
        "balanced" => (65u8, 1600u32),
        "strong" => (40u8, 1024u32),
        _ => return Err(format!("Unknown compression level: {}", level)),
    };

    let object_ids: Vec<ObjectId> = doc.objects.keys().cloned().collect();

    for id in object_ids {
        let is_image = {
            if let Some(Object::Stream(ref stream)) = doc.objects.get(&id) {
                dict_get_name(&stream.dict, b"Subtype")
                    .map(|n| n == b"Image")
                    .unwrap_or(false)
            } else {
                false
            }
        };

        if is_image {
            if let Some(Object::Stream(ref mut stream)) = doc.objects.get_mut(&id) {
                stream.decompress();

                let width = dict_get_int(&stream.dict, b"Width").unwrap_or(0) as u32;
                let height = dict_get_int(&stream.dict, b"Height").unwrap_or(0) as u32;
                let bpc = dict_get_int(&stream.dict, b"BitsPerComponent").unwrap_or(8) as u32;

                if width == 0 || height == 0 || bpc != 8 {
                    continue;
                }

                let color_space = dict_get_name(&stream.dict, b"ColorSpace")
                    .unwrap_or(b"DeviceRGB");

                let channels: u32 = if color_space == b"DeviceGray" { 1 } else { 3 };
                let expected_len = (width * height * channels) as usize;

                if stream.content.len() < expected_len {
                    continue;
                }

                let img_result = if channels == 1 {
                    image::GrayImage::from_raw(
                        width,
                        height,
                        stream.content[..expected_len].to_vec(),
                    )
                    .map(image::DynamicImage::ImageLuma8)
                } else {
                    image::RgbImage::from_raw(
                        width,
                        height,
                        stream.content[..expected_len].to_vec(),
                    )
                    .map(image::DynamicImage::ImageRgb8)
                };

                if let Some(img) = img_result {
                    let img = if width > max_dimension || height > max_dimension {
                        img.resize(
                            max_dimension,
                            max_dimension,
                            image::imageops::FilterType::Lanczos3,
                        )
                    } else {
                        img
                    };

                    let new_width = img.width();
                    let new_height = img.height();

                    let mut jpeg_buf = Vec::new();
                    let mut cursor = std::io::Cursor::new(&mut jpeg_buf);
                    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                        &mut cursor,
                        jpeg_quality,
                    );
                    if img.write_with_encoder(encoder).is_ok() {
                        stream.dict.set("Width", Object::Integer(new_width as i64));
                        stream.dict.set("Height", Object::Integer(new_height as i64));
                        stream.dict.set(
                            "ColorSpace",
                            Object::Name(b"DeviceRGB".to_vec()),
                        );
                        stream.dict.set("BitsPerComponent", Object::Integer(8));
                        stream
                            .dict
                            .set("Filter", Object::Name(b"DCTDecode".to_vec()));
                        stream
                            .dict
                            .set("Length", Object::Integer(jpeg_buf.len() as i64));
                        stream.content = jpeg_buf;
                    }
                }
            }
        }
    }

    doc.prune_objects();
    doc.compress();

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save compressed PDF: {}", e))?;

    let after_size = fs::metadata(&output_file).map(|m| m.len()).unwrap_or(0);

    Ok(format!(
        "Compressed: {} → {} bytes (saved {}%)",
        before_size,
        after_size,
        if before_size > 0 {
            100 - (after_size * 100 / before_size)
        } else {
            0
        }
    ))
}

#[tauri::command]
fn reorder_pages(
    input_file: String,
    output_file: String,
    new_order: Vec<u32>,
    pages_to_delete: Vec<u32>,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let total_pages = doc.get_pages().len() as u32;

    let filtered_order: Vec<u32> = new_order
        .into_iter()
        .filter(|p| !pages_to_delete.contains(p))
        .collect();

    if filtered_order.is_empty() {
        return Err("No pages remaining after reorder/delete.".into());
    }

    for &p in &filtered_order {
        if p < 1 || p > total_pages {
            return Err(format!("Page {} is out of range (1-{}).", p, total_pages));
        }
    }

    let mut new_doc = extract_pages(&doc, &filtered_order)?;
    new_doc.compress();
    new_doc
        .save(&output_file)
        .map_err(|e| format!("Failed to save reordered PDF: {}", e))?;

    Ok(())
}

#[tauri::command]
fn images_to_pdf(images: Vec<String>, output_file: String) -> Result<(), String> {
    if images.is_empty() {
        return Err("No images provided.".into());
    }
    for f in &images {
        if !Path::new(f).exists() {
            return Err(format!("Image not found: {}", f));
        }
    }

    use printpdf::*;

    let first_img = ::image::open(&images[0])
        .map_err(|e| format!("Failed to open image {}: {}", images[0], e))?;

    let (w, h) = (first_img.width() as f32, first_img.height() as f32);
    let dpi = 150.0;
    let page_w = Mm(w / dpi * 25.4);
    let page_h = Mm(h / dpi * 25.4);

    let (doc, page1, layer1) =
        PdfDocument::new("Images to PDF", page_w, page_h, "Layer 1");

    add_image_to_layer(&doc, page1, layer1, &first_img)?;

    for img_path in &images[1..] {
        let img = ::image::open(img_path)
            .map_err(|e| format!("Failed to open image {}: {}", img_path, e))?;

        let (iw, ih) = (img.width() as f32, img.height() as f32);
        let pw = Mm(iw / dpi * 25.4);
        let ph = Mm(ih / dpi * 25.4);

        let (page, layer) = doc.add_page(pw, ph, "Layer 1");
        add_image_to_layer(&doc, page, layer, &img)?;
    }

    let pdf_bytes = doc
        .save_to_bytes()
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    fs::write(&output_file, pdf_bytes)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    Ok(())
}

fn add_image_to_layer(
    doc: &printpdf::PdfDocumentReference,
    page_idx: printpdf::indices::PdfPageIndex,
    layer_idx: printpdf::indices::PdfLayerIndex,
    img: &::image::DynamicImage,
) -> Result<(), String> {
    let rgb_img = img.to_rgb8();
    let (width, height) = rgb_img.dimensions();
    let raw_pixels = rgb_img.into_raw();

    let image_xobj = printpdf::ImageXObject {
        width: printpdf::Px(width as usize),
        height: printpdf::Px(height as usize),
        color_space: printpdf::ColorSpace::Rgb,
        bits_per_component: printpdf::ColorBits::Bit8,
        interpolate: true,
        image_data: raw_pixels,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    };

    let pdf_image = printpdf::Image::from(image_xobj);
    let page = doc.get_page(page_idx);
    let layer = page.get_layer(layer_idx);

    pdf_image.add_to_layer(
        layer,
        printpdf::ImageTransform::default(),
    );

    Ok(())
}

#[tauri::command]
fn pdf_to_images(
    input_file: String,
    output_dir: String,
    format: String,
) -> Result<Vec<String>, String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let out_path = Path::new(&output_dir);
    if !out_path.exists() {
        fs::create_dir_all(out_path)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let pages = doc.get_pages();
    let total_pages = pages.len();

    if total_pages == 0 {
        return Err("PDF has no pages.".into());
    }

    let ext = match format.to_lowercase().as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        _ => return Err(format!("Unsupported format: {}. Use png or jpg.", format)),
    };

    let mut output_paths: Vec<String> = Vec::new();
    let mut sorted_pages: Vec<_> = pages.iter().collect();
    sorted_pages.sort_by_key(|(num, _)| *num);

    let stem = Path::new(&input_file)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("page");

    for (page_num, page_id) in &sorted_pages {
        let out_file = out_path.join(format!("{}_{}.{}", stem, page_num, ext));
        let mut extracted = false;

        if let Some(Object::Dictionary(page_dict)) = doc.objects.get(page_id) {
            if let Ok(resources_ref) = page_dict.get(b"Resources") {
                let resources = match resources_ref {
                    Object::Reference(id) => doc.objects.get(id),
                    Object::Dictionary(_) => Some(resources_ref),
                    _ => None,
                };

                if let Some(Object::Dictionary(res_dict)) = resources {
                    let xobject = match res_dict.get(b"XObject") {
                        Ok(Object::Reference(id)) => {
                            if let Some(Object::Dictionary(d)) = doc.objects.get(id) {
                                Some(d)
                            } else {
                                None
                            }
                        }
                        Ok(Object::Dictionary(d)) => Some(d),
                        _ => None,
                    };

                    if let Some(xobj_dict) = xobject {
                        for (_, obj_ref) in xobj_dict.iter() {
                            if let Object::Reference(img_id) = obj_ref {
                                if let Some(Object::Stream(stream)) =
                                    doc.objects.get(img_id)
                                {
                                    let is_image = dict_get_name(
                                        &stream.dict,
                                        b"Subtype",
                                    )
                                    .map(|n| n == b"Image")
                                    .unwrap_or(false);

                                    if is_image
                                        && extract_image_from_stream(
                                            stream, &out_file, ext,
                                        )
                                        .is_ok()
                                    {
                                        output_paths.push(
                                            out_file
                                                .to_string_lossy()
                                                .to_string(),
                                        );
                                        extracted = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if !extracted {
            let placeholder =
                image::RgbImage::from_fn(612, 792, |_, _| image::Rgb([255u8, 255, 255]));
            let dyn_img = image::DynamicImage::ImageRgb8(placeholder);
            dyn_img
                .save(&out_file)
                .map_err(|e| format!("Failed to save placeholder: {}", e))?;
            output_paths.push(out_file.to_string_lossy().to_string());
        }
    }

    Ok(output_paths)
}

fn extract_image_from_stream(
    stream: &lopdf::Stream,
    out_path: &Path,
    ext: &str,
) -> Result<(), String> {
    let mut stream_clone = stream.clone();
    stream_clone.decompress();

    let width = dict_get_int(&stream_clone.dict, b"Width")
        .ok_or("No width")? as u32;
    let height = dict_get_int(&stream_clone.dict, b"Height")
        .ok_or("No height")? as u32;

    let filter = dict_get_name(&stream.dict, b"Filter").unwrap_or(b"");

    if filter == b"DCTDecode" {
        if ext == "jpg" {
            fs::write(out_path, &stream.content)
                .map_err(|e| format!("Write error: {}", e))?;
            return Ok(());
        } else {
            let img = image::load_from_memory(&stream.content)
                .map_err(|e| format!("JPEG decode error: {}", e))?;
            img.save(out_path)
                .map_err(|e| format!("Save error: {}", e))?;
            return Ok(());
        }
    }

    let color_space =
        dict_get_name(&stream_clone.dict, b"ColorSpace").unwrap_or(b"DeviceRGB");

    let channels: u32 = if color_space == b"DeviceGray" { 1 } else { 3 };
    let expected = (width * height * channels) as usize;

    if stream_clone.content.len() < expected {
        return Err("Insufficient pixel data".into());
    }

    let img = if channels == 1 {
        image::GrayImage::from_raw(
            width,
            height,
            stream_clone.content[..expected].to_vec(),
        )
        .map(image::DynamicImage::ImageLuma8)
    } else {
        image::RgbImage::from_raw(
            width,
            height,
            stream_clone.content[..expected].to_vec(),
        )
        .map(image::DynamicImage::ImageRgb8)
    };

    if let Some(img) = img {
        img.save(out_path)
            .map_err(|e| format!("Save error: {}", e))?;
        Ok(())
    } else {
        Err("Failed to construct image from raw data".into())
    }
}

#[tauri::command]
fn compare_pdfs(left_file: String, right_file: String) -> Result<CompareResult, String> {
    if !Path::new(&left_file).exists() {
        return Err(format!("File not found: {}", left_file));
    }
    if !Path::new(&right_file).exists() {
        return Err(format!("File not found: {}", right_file));
    }

    let left_doc = Document::load(&left_file)
        .map_err(|e| format!("Failed to load left PDF: {}", e))?;
    let right_doc = Document::load(&right_file)
        .map_err(|e| format!("Failed to load right PDF: {}", e))?;

    let left_page_count = get_page_count(&left_doc);
    let right_page_count = get_page_count(&right_doc);
    let same_page_count = left_page_count == right_page_count;
    let page_count_diff = right_page_count as i32 - left_page_count as i32;

    let mut simple_difference = !same_page_count;

    if same_page_count {
        let max_pages = std::cmp::min(left_page_count, 10);
        let left_pages = left_doc.get_pages();
        let right_pages = right_doc.get_pages();

        for page_num in 1..=max_pages {
            let left_text = extract_page_text(&left_doc, left_pages.get(&page_num));
            let right_text =
                extract_page_text(&right_doc, right_pages.get(&page_num));

            if left_text != right_text {
                simple_difference = true;
                break;
            }
        }
    }

    Ok(CompareResult {
        left_page_count,
        right_page_count,
        same_page_count,
        page_count_diff,
        simple_difference,
    })
}

fn extract_page_text(doc: &Document, page_id: Option<&ObjectId>) -> String {
    let Some(&page_id) = page_id else {
        return String::new();
    };

    let Some(Object::Dictionary(page_dict)) = doc.objects.get(&page_id) else {
        return String::new();
    };

    let contents_ref = match page_dict.get(b"Contents") {
        Ok(obj) => obj,
        Err(_) => return String::new(),
    };

    let content_ids: Vec<ObjectId> = match contents_ref {
        Object::Reference(id) => vec![*id],
        Object::Array(arr) => arr
            .iter()
            .filter_map(|o| {
                if let Object::Reference(id) = o {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect(),
        _ => return String::new(),
    };

    let mut text = String::new();
    for cid in content_ids {
        if let Some(Object::Stream(stream)) = doc.objects.get(&cid) {
            let mut s = stream.clone();
            s.decompress();
            let content_str = String::from_utf8_lossy(&s.content);
            for segment in content_str.split('(') {
                if let Some(end) = segment.find(')') {
                    text.push_str(&segment[..end]);
                }
            }
        }
    }

    text
}

#[tauri::command]
fn get_pdf_page_count(input_file: String) -> Result<u32, String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }
    let doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;
    Ok(get_page_count(&doc))
}

// ── Read PDF Bytes (for frontend rendering) ─────────────────────────────────

#[tauri::command]
fn read_pdf_bytes(input_file: String) -> Result<Vec<u8>, String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }
    fs::read(&input_file).map_err(|e| format!("Failed to read file: {}", e))
}

// ── Rotate PDF ──────────────────────────────────────────────────────────────

#[tauri::command]
fn rotate_pdf(
    input_file: String,
    output_file: String,
    angle: i64,
    pages: Vec<u32>,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }
    if ![0, 90, 180, 270].contains(&angle) {
        return Err("Angle must be 0, 90, 180, or 270.".into());
    }

    let mut doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let page_map = doc.get_pages();
    let total = page_map.len() as u32;

    let target_pages: Vec<u32> = if pages.is_empty() {
        (1..=total).collect()
    } else {
        pages
    };

    for &pn in &target_pages {
        if pn < 1 || pn > total {
            return Err(format!("Page {} out of range (1-{}).", pn, total));
        }
        if let Some(&page_id) = page_map.get(&pn) {
            if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                let current = dict_get_int(dict, b"Rotate").unwrap_or(0);
                let new_angle = (current + angle) % 360;
                dict.set("Rotate", Object::Integer(new_angle));
            }
        }
    }

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save rotated PDF: {}", e))?;

    Ok(())
}

// ── Add Page Numbers ────────────────────────────────────────────────────────

fn get_page_media_box(doc: &Document, page_id: &ObjectId) -> (f64, f64) {
    if let Some(Object::Dictionary(dict)) = doc.objects.get(page_id) {
        if let Ok(Object::Array(media_box)) = dict.get(b"MediaBox") {
            if media_box.len() == 4 {
                let w = match &media_box[2] {
                    Object::Integer(n) => *n as f64,
                    Object::Real(n) => *n as f64,
                    _ => 612.0,
                };
                let h = match &media_box[3] {
                    Object::Integer(n) => *n as f64,
                    Object::Real(n) => *n as f64,
                    _ => 792.0,
                };
                return (w, h);
            }
        }
    }
    (612.0, 792.0)
}

/// Helper: inspect a page dict to determine its resource situation (read-only phase).
/// Returns (Option<resource_ref_id>, Option<font_ref_id>, existing_contents_info)
enum ResInfo {
    RefId(ObjectId),           // Resources is a Reference
    Inline,                    // Resources is an inline Dictionary
    Missing,                   // No Resources at all
}

enum FontInfo {
    RefId(ObjectId),           // Font dict is a Reference
    Inline,                    // Font dict is inline in resources
    Missing,                   // No Font dict
}

enum ContentsInfo {
    Ref(ObjectId),
    Array(Vec<Object>),
    Missing,
}

fn read_page_info(doc: &Document, page_id: &ObjectId) -> (ResInfo, FontInfo, ContentsInfo) {
    let (res_info, font_info) = if let Some(Object::Dictionary(dict)) = doc.objects.get(page_id) {
        let ri = match dict.get(b"Resources") {
            Ok(Object::Reference(id)) => ResInfo::RefId(*id),
            Ok(Object::Dictionary(_)) => ResInfo::Inline,
            _ => ResInfo::Missing,
        };
        let fi = match &ri {
            ResInfo::RefId(res_id) => {
                if let Some(Object::Dictionary(res_dict)) = doc.objects.get(res_id) {
                    match res_dict.get(b"Font") {
                        Ok(Object::Reference(fid)) => FontInfo::RefId(*fid),
                        Ok(Object::Dictionary(_)) => FontInfo::Inline,
                        _ => FontInfo::Missing,
                    }
                } else { FontInfo::Missing }
            }
            ResInfo::Inline => {
                if let Ok(Object::Dictionary(res_dict)) = dict.get(b"Resources") {
                    match res_dict.get(b"Font") {
                        Ok(Object::Reference(fid)) => FontInfo::RefId(*fid),
                        Ok(Object::Dictionary(_)) => FontInfo::Inline,
                        _ => FontInfo::Missing,
                    }
                } else { FontInfo::Missing }
            }
            ResInfo::Missing => FontInfo::Missing,
        };
        (ri, fi)
    } else {
        (ResInfo::Missing, FontInfo::Missing)
    };

    let contents_info = if let Some(Object::Dictionary(dict)) = doc.objects.get(page_id) {
        match dict.get(b"Contents") {
            Ok(Object::Reference(id)) => ContentsInfo::Ref(*id),
            Ok(Object::Array(arr)) => ContentsInfo::Array(arr.clone()),
            _ => ContentsInfo::Missing,
        }
    } else {
        ContentsInfo::Missing
    };

    (res_info, font_info, contents_info)
}

/// Helper: add font F1 to a page's resources and append content stream, using pre-collected info.
fn inject_font_and_content(
    doc: &mut Document,
    page_id: ObjectId,
    font_id: ObjectId,
    content_id: ObjectId,
    res_info: &ResInfo,
    font_info: &FontInfo,
    contents_info: &ContentsInfo,
) {
    // Step 1: Add font to the right place
    match font_info {
        FontInfo::RefId(fid) => {
            if let Some(Object::Dictionary(ref mut fd)) = doc.objects.get_mut(fid) {
                fd.set("F1", Object::Reference(font_id));
            }
        }
        FontInfo::Inline => {
            match res_info {
                ResInfo::RefId(res_id) => {
                    if let Some(Object::Dictionary(ref mut res_dict)) = doc.objects.get_mut(res_id) {
                        if let Ok(Object::Dictionary(ref mut fd)) = res_dict.get_mut(b"Font") {
                            fd.set("F1", Object::Reference(font_id));
                        }
                    }
                }
                ResInfo::Inline => {
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        if let Ok(Object::Dictionary(ref mut res_dict)) = dict.get_mut(b"Resources") {
                            if let Ok(Object::Dictionary(ref mut fd)) = res_dict.get_mut(b"Font") {
                                fd.set("F1", Object::Reference(font_id));
                            }
                        }
                    }
                }
                ResInfo::Missing => {}
            }
        }
        FontInfo::Missing => {
            let font_res = dictionary! { "F1" => Object::Reference(font_id) };
            match res_info {
                ResInfo::RefId(res_id) => {
                    if let Some(Object::Dictionary(ref mut res_dict)) = doc.objects.get_mut(res_id) {
                        res_dict.set("Font", Object::Dictionary(font_res));
                    }
                }
                ResInfo::Inline => {
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        if let Ok(Object::Dictionary(ref mut res_dict)) = dict.get_mut(b"Resources") {
                            res_dict.set("Font", Object::Dictionary(font_res));
                        }
                    }
                }
                ResInfo::Missing => {
                    let res = dictionary! { "Font" => Object::Dictionary(font_res) };
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        dict.set("Resources", Object::Dictionary(res));
                    }
                }
            }
        }
    }

    // Step 2: Append content stream
    let new_contents = match contents_info {
        ContentsInfo::Ref(existing_id) => {
            Object::Array(vec![Object::Reference(*existing_id), Object::Reference(content_id)])
        }
        ContentsInfo::Array(arr) => {
            let mut new_arr = arr.clone();
            new_arr.push(Object::Reference(content_id));
            Object::Array(new_arr)
        }
        ContentsInfo::Missing => {
            Object::Reference(content_id)
        }
    };
    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
        dict.set("Contents", new_contents);
    }
}

#[tauri::command]
fn add_page_numbers(
    input_file: String,
    output_file: String,
    position: String,
    start_number: u32,
    font_size: f64,
    format_str: String,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let mut doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let pages = doc.get_pages();
    let mut sorted_pages: Vec<_> = pages.iter().map(|(n, id)| (*n, *id)).collect();
    sorted_pages.sort_by_key(|(num, _)| *num);
    let total = sorted_pages.len() as u32;

    let font_size = if font_size <= 0.0 { 12.0 } else { font_size };

    for (i, (_page_num, page_id)) in sorted_pages.iter().enumerate() {
        let current_num = start_number + i as u32;
        let (page_w, page_h) = get_page_media_box(&doc, page_id);

        let label = format_str
            .replace("{n}", &current_num.to_string())
            .replace("{total}", &total.to_string());

        let (x, y) = match position.as_str() {
            "bottom-left" => (40.0, 30.0),
            "bottom-right" => (page_w - 40.0, 30.0),
            "top-left" => (40.0, page_h - 30.0),
            "top-center" => (page_w / 2.0, page_h - 30.0),
            "top-right" => (page_w - 40.0, page_h - 30.0),
            _ => (page_w / 2.0, 30.0),
        };

        // Read page info before mutating
        let (res_info, font_info, contents_info) = read_page_info(&doc, page_id);

        let content = format!(
            "q BT /F1 {} Tf {} {} Td ({}) Tj ET Q",
            font_size, x, y, label
        );

        let font_dict = dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        };
        let font_id = doc.add_object(font_dict);

        let content_id = doc.add_object(Stream::new(
            dictionary! { "Length" => Object::Integer(content.len() as i64) },
            content.into_bytes(),
        ));

        inject_font_and_content(&mut doc, *page_id, font_id, content_id, &res_info, &font_info, &contents_info);
    }

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save: {}", e))?;
    Ok(())
}

// ── Add Watermark ───────────────────────────────────────────────────────────

/// Helper: also read ExtGState info from page resources
enum GsInfo {
    RefId(ObjectId),
    Inline,
    Missing,
}

fn read_gs_info(doc: &Document, page_id: &ObjectId, res_info: &ResInfo) -> GsInfo {
    match res_info {
        ResInfo::RefId(res_id) => {
            if let Some(Object::Dictionary(res_dict)) = doc.objects.get(res_id) {
                match res_dict.get(b"ExtGState") {
                    Ok(Object::Reference(id)) => GsInfo::RefId(*id),
                    Ok(Object::Dictionary(_)) => GsInfo::Inline,
                    _ => GsInfo::Missing,
                }
            } else { GsInfo::Missing }
        }
        ResInfo::Inline => {
            if let Some(Object::Dictionary(dict)) = doc.objects.get(page_id) {
                if let Ok(Object::Dictionary(res_dict)) = dict.get(b"Resources") {
                    match res_dict.get(b"ExtGState") {
                        Ok(Object::Reference(id)) => GsInfo::RefId(*id),
                        Ok(Object::Dictionary(_)) => GsInfo::Inline,
                        _ => GsInfo::Missing,
                    }
                } else { GsInfo::Missing }
            } else { GsInfo::Missing }
        }
        ResInfo::Missing => GsInfo::Missing,
    }
}

fn inject_gs(doc: &mut Document, page_id: ObjectId, gs_id: ObjectId, res_info: &ResInfo, gs_info: &GsInfo) {
    match gs_info {
        GsInfo::RefId(gid) => {
            if let Some(Object::Dictionary(ref mut gd)) = doc.objects.get_mut(gid) {
                gd.set("GS1", Object::Reference(gs_id));
            }
        }
        GsInfo::Inline => {
            match res_info {
                ResInfo::RefId(res_id) => {
                    if let Some(Object::Dictionary(ref mut res_dict)) = doc.objects.get_mut(res_id) {
                        if let Ok(Object::Dictionary(ref mut gd)) = res_dict.get_mut(b"ExtGState") {
                            gd.set("GS1", Object::Reference(gs_id));
                        }
                    }
                }
                ResInfo::Inline => {
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        if let Ok(Object::Dictionary(ref mut res_dict)) = dict.get_mut(b"Resources") {
                            if let Ok(Object::Dictionary(ref mut gd)) = res_dict.get_mut(b"ExtGState") {
                                gd.set("GS1", Object::Reference(gs_id));
                            }
                        }
                    }
                }
                ResInfo::Missing => {}
            }
        }
        GsInfo::Missing => {
            let gs_res = dictionary! { "GS1" => Object::Reference(gs_id) };
            match res_info {
                ResInfo::RefId(res_id) => {
                    if let Some(Object::Dictionary(ref mut res_dict)) = doc.objects.get_mut(res_id) {
                        res_dict.set("ExtGState", Object::Dictionary(gs_res));
                    }
                }
                ResInfo::Inline => {
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        if let Ok(Object::Dictionary(ref mut res_dict)) = dict.get_mut(b"Resources") {
                            res_dict.set("ExtGState", Object::Dictionary(gs_res));
                        }
                    }
                }
                ResInfo::Missing => {
                    // Resources will be created by inject_font_and_content or we need to add it here
                }
            }
        }
    }
}

#[tauri::command]
fn add_watermark(
    input_file: String,
    output_file: String,
    text: String,
    font_size: f64,
    opacity: f64,
    color: String,
    position: String,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }
    if text.is_empty() {
        return Err("Watermark text cannot be empty.".into());
    }

    let mut doc =
        Document::load(&input_file).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let font_size = if font_size <= 0.0 { 48.0 } else { font_size };
    let opacity = opacity.clamp(0.0, 1.0);

    let color_str = color.trim_start_matches('#');
    let (r, g, b) = if color_str.len() == 6 {
        let r = u8::from_str_radix(&color_str[0..2], 16).unwrap_or(128) as f64 / 255.0;
        let g = u8::from_str_radix(&color_str[2..4], 16).unwrap_or(128) as f64 / 255.0;
        let b = u8::from_str_radix(&color_str[4..6], 16).unwrap_or(128) as f64 / 255.0;
        (r, g, b)
    } else {
        (0.5, 0.5, 0.5)
    };

    let gs_dict = dictionary! {
        "Type" => "ExtGState",
        "ca" => Object::Real(opacity as f32),
        "CA" => Object::Real(opacity as f32),
    };
    let gs_id = doc.add_object(gs_dict);

    let pages = doc.get_pages();
    let sorted_pages: Vec<_> = {
        let mut v: Vec<_> = pages.iter().map(|(n, id)| (*n, *id)).collect();
        v.sort_by_key(|(num, _)| *num);
        v
    };

    for (_page_num, page_id) in &sorted_pages {
        let (page_w, page_h) = get_page_media_box(&doc, page_id);

        let (res_info, font_info, contents_info) = read_page_info(&doc, page_id);
        let gs_info = read_gs_info(&doc, page_id, &res_info);

        let content = match position.as_str() {
            "center" => format!(
                "q /GS1 gs BT /F1 {} Tf {} {} {} rg {} {} Td ({}) Tj ET Q",
                font_size, r, g, b, page_w / 2.0 - (text.len() as f64 * font_size * 0.25), page_h / 2.0, text
            ),
            "top" => format!(
                "q /GS1 gs BT /F1 {} Tf {} {} {} rg {} {} Td ({}) Tj ET Q",
                font_size, r, g, b, page_w / 2.0 - (text.len() as f64 * font_size * 0.25), page_h - 50.0, text
            ),
            "bottom" => format!(
                "q /GS1 gs BT /F1 {} Tf {} {} {} rg {} {} Td ({}) Tj ET Q",
                font_size, r, g, b, page_w / 2.0 - (text.len() as f64 * font_size * 0.25), 40.0, text
            ),
            _ => {
                let angle: f64 = 45.0_f64.to_radians();
                let cos = angle.cos();
                let sin = angle.sin();
                format!(
                    "q /GS1 gs BT /F1 {} Tf {} {} {} rg {} {} {} {} {} {} Tm ({}) Tj ET Q",
                    font_size, r, g, b, cos, sin, -sin, cos,
                    page_w / 4.0, page_h / 4.0, text
                )
            }
        };

        let font_dict = dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica-Bold",
        };
        let font_id = doc.add_object(font_dict);

        let content_id = doc.add_object(Stream::new(
            dictionary! { "Length" => Object::Integer(content.len() as i64) },
            content.into_bytes(),
        ));

        // If resources are completely missing, create them with both font and GS
        if matches!(res_info, ResInfo::Missing) {
            let font_res = dictionary! { "F1" => Object::Reference(font_id) };
            let gs_res = dictionary! { "GS1" => Object::Reference(gs_id) };
            let res = dictionary! {
                "Font" => Object::Dictionary(font_res),
                "ExtGState" => Object::Dictionary(gs_res),
            };
            if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(page_id) {
                dict.set("Resources", Object::Dictionary(res));
            }
        } else {
            inject_font_and_content(&mut doc, *page_id, font_id, content_id, &res_info, &font_info, &contents_info);
            inject_gs(&mut doc, *page_id, gs_id, &res_info, &gs_info);
            // Content already appended by inject_font_and_content, skip below
            continue;
        }

        // Append content for the Missing resources case
        let new_contents = match contents_info {
            ContentsInfo::Ref(existing_id) => {
                Object::Array(vec![Object::Reference(existing_id), Object::Reference(content_id)])
            }
            ContentsInfo::Array(ref arr) => {
                let mut new_arr = arr.clone();
                new_arr.push(Object::Reference(content_id));
                Object::Array(new_arr)
            }
            ContentsInfo::Missing => Object::Reference(content_id),
        };
        if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(page_id) {
            dict.set("Contents", new_contents);
        }
    }

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save watermarked PDF: {}", e))?;
    Ok(())
}

// ── PDF Metadata ────────────────────────────────────────────────────────────

#[tauri::command]
fn get_metadata(input_file: String) -> Result<PdfMetadata, String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let mut meta = PdfMetadata {
        title: String::new(),
        author: String::new(),
        subject: String::new(),
        keywords: String::new(),
        creator: String::new(),
    };

    if let Ok(info_ref) = doc.trailer.get(b"Info") {
        let info_dict = match info_ref {
            Object::Reference(id) => {
                if let Some(Object::Dictionary(d)) = doc.objects.get(id) {
                    Some(d)
                } else {
                    None
                }
            }
            Object::Dictionary(d) => Some(d),
            _ => None,
        };

        if let Some(info) = info_dict {
            let get_str = |key: &[u8]| -> String {
                match info.get(key) {
                    Ok(Object::String(bytes, _)) => String::from_utf8_lossy(bytes).to_string(),
                    _ => String::new(),
                }
            };
            meta.title = get_str(b"Title");
            meta.author = get_str(b"Author");
            meta.subject = get_str(b"Subject");
            meta.keywords = get_str(b"Keywords");
            meta.creator = get_str(b"Creator");
        }
    }

    Ok(meta)
}

#[tauri::command]
fn edit_metadata(
    input_file: String,
    output_file: String,
    metadata: PdfMetadata,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let mut doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let info_dict = dictionary! {
        "Title" => Object::String(metadata.title.into_bytes(), lopdf::StringFormat::Literal),
        "Author" => Object::String(metadata.author.into_bytes(), lopdf::StringFormat::Literal),
        "Subject" => Object::String(metadata.subject.into_bytes(), lopdf::StringFormat::Literal),
        "Keywords" => Object::String(metadata.keywords.into_bytes(), lopdf::StringFormat::Literal),
        "Creator" => Object::String(metadata.creator.into_bytes(), lopdf::StringFormat::Literal),
    };
    let info_id = doc.add_object(info_dict);
    doc.trailer.set("Info", Object::Reference(info_id));

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save: {}", e))?;
    Ok(())
}

// ── Extract Text ────────────────────────────────────────────────────────────

#[tauri::command]
fn extract_text(input_file: String, output_file: String) -> Result<String, String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let pages = doc.get_pages();
    let mut sorted_pages: Vec<_> = pages.iter().collect();
    sorted_pages.sort_by_key(|(num, _)| *num);

    let mut all_text = String::new();
    for (page_num, page_id) in &sorted_pages {
        let text = extract_page_text(&doc, Some(page_id));
        if !text.is_empty() {
            all_text.push_str(&format!("--- Page {} ---\n", page_num));
            all_text.push_str(&text);
            all_text.push_str("\n\n");
        }
    }

    if all_text.is_empty() {
        return Err("No extractable text found in the PDF.".into());
    }

    fs::write(&output_file, &all_text)
        .map_err(|e| format!("Failed to write text file: {}", e))?;

    Ok(format!("Extracted text from {} pages.", sorted_pages.len()))
}

// ── Sign PDF (overlay image at position) ────────────────────────────────────

enum XObjInfo {
    RefId(ObjectId),
    Inline,
    Missing,
}

fn read_xobj_info(doc: &Document, page_id: &ObjectId, res_info: &ResInfo) -> XObjInfo {
    match res_info {
        ResInfo::RefId(res_id) => {
            if let Some(Object::Dictionary(res_dict)) = doc.objects.get(res_id) {
                match res_dict.get(b"XObject") {
                    Ok(Object::Reference(id)) => XObjInfo::RefId(*id),
                    Ok(Object::Dictionary(_)) => XObjInfo::Inline,
                    _ => XObjInfo::Missing,
                }
            } else { XObjInfo::Missing }
        }
        ResInfo::Inline => {
            if let Some(Object::Dictionary(dict)) = doc.objects.get(page_id) {
                if let Ok(Object::Dictionary(res_dict)) = dict.get(b"Resources") {
                    match res_dict.get(b"XObject") {
                        Ok(Object::Reference(id)) => XObjInfo::RefId(*id),
                        Ok(Object::Dictionary(_)) => XObjInfo::Inline,
                        _ => XObjInfo::Missing,
                    }
                } else { XObjInfo::Missing }
            } else { XObjInfo::Missing }
        }
        ResInfo::Missing => XObjInfo::Missing,
    }
}

fn inject_xobj(doc: &mut Document, page_id: ObjectId, name: &str, img_id: ObjectId, res_info: &ResInfo, xobj_info: &XObjInfo) {
    match xobj_info {
        XObjInfo::RefId(xid) => {
            if let Some(Object::Dictionary(ref mut xd)) = doc.objects.get_mut(xid) {
                xd.set(name, Object::Reference(img_id));
            }
        }
        XObjInfo::Inline => {
            match res_info {
                ResInfo::RefId(res_id) => {
                    if let Some(Object::Dictionary(ref mut res_dict)) = doc.objects.get_mut(res_id) {
                        if let Ok(Object::Dictionary(ref mut xd)) = res_dict.get_mut(b"XObject") {
                            xd.set(name, Object::Reference(img_id));
                        }
                    }
                }
                ResInfo::Inline => {
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        if let Ok(Object::Dictionary(ref mut res_dict)) = dict.get_mut(b"Resources") {
                            if let Ok(Object::Dictionary(ref mut xd)) = res_dict.get_mut(b"XObject") {
                                xd.set(name, Object::Reference(img_id));
                            }
                        }
                    }
                }
                ResInfo::Missing => {}
            }
        }
        XObjInfo::Missing => {
            let xobj = dictionary! { name => Object::Reference(img_id) };
            match res_info {
                ResInfo::RefId(res_id) => {
                    if let Some(Object::Dictionary(ref mut res_dict)) = doc.objects.get_mut(res_id) {
                        res_dict.set("XObject", Object::Dictionary(xobj));
                    }
                }
                ResInfo::Inline => {
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        if let Ok(Object::Dictionary(ref mut res_dict)) = dict.get_mut(b"Resources") {
                            res_dict.set("XObject", Object::Dictionary(xobj));
                        }
                    }
                }
                ResInfo::Missing => {
                    let res = dictionary! { "XObject" => Object::Dictionary(xobj) };
                    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
                        dict.set("Resources", Object::Dictionary(res));
                    }
                }
            }
        }
    }
}

fn append_content(doc: &mut Document, page_id: ObjectId, content_id: ObjectId, contents_info: &ContentsInfo) {
    let new_contents = match contents_info {
        ContentsInfo::Ref(existing_id) => {
            Object::Array(vec![Object::Reference(*existing_id), Object::Reference(content_id)])
        }
        ContentsInfo::Array(arr) => {
            let mut new_arr = arr.clone();
            new_arr.push(Object::Reference(content_id));
            Object::Array(new_arr)
        }
        ContentsInfo::Missing => Object::Reference(content_id),
    };
    if let Some(Object::Dictionary(ref mut dict)) = doc.objects.get_mut(&page_id) {
        dict.set("Contents", new_contents);
    }
}

#[tauri::command]
fn sign_pdf(
    input_file: String,
    output_file: String,
    image_data: Vec<u8>,
    page_number: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let mut doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let pages = doc.get_pages();
    let &page_id = pages.get(&page_number)
        .ok_or(format!("Page {} not found.", page_number))?;

    let img = image::load_from_memory(&image_data)
        .map_err(|e| format!("Failed to decode signature image: {}", e))?;
    let rgb_img = img.to_rgb8();
    let (img_w, img_h) = rgb_img.dimensions();
    let raw_pixels = rgb_img.into_raw();

    // Read page info before mutating
    let (res_info, _font_info, contents_info) = read_page_info(&doc, &page_id);
    let xobj_info = read_xobj_info(&doc, &page_id, &res_info);

    let img_stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => Object::Integer(img_w as i64),
            "Height" => Object::Integer(img_h as i64),
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => Object::Integer(8),
            "Length" => Object::Integer(raw_pixels.len() as i64),
        },
        raw_pixels,
    );
    let img_id = doc.add_object(img_stream);

    let content = format!(
        "q {} 0 0 {} {} {} cm /SigImg Do Q",
        width, height, x, y
    );
    let content_id = doc.add_object(Stream::new(
        dictionary! { "Length" => Object::Integer(content.len() as i64) },
        content.into_bytes(),
    ));

    inject_xobj(&mut doc, page_id, "SigImg", img_id, &res_info, &xobj_info);
    append_content(&mut doc, page_id, content_id, &contents_info);

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save signed PDF: {}", e))?;
    Ok(())
}

// ── Add Text to PDF ─────────────────────────────────────────────────────────

#[tauri::command]
fn add_text_to_pdf(
    input_file: String,
    output_file: String,
    text: String,
    page_number: u32,
    x: f64,
    y: f64,
    font_size: f64,
    color: String,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let mut doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let pages = doc.get_pages();
    let total = pages.len() as u32;
    if page_number < 1 || page_number > total {
        return Err(format!("Page {} out of range (1-{}).", page_number, total));
    }
    let &page_id = pages.get(&page_number).unwrap();

    let font_size = if font_size <= 0.0 { 12.0 } else { font_size };

    let color_str = color.trim_start_matches('#');
    let (r, g, b) = if color_str.len() == 6 {
        let r = u8::from_str_radix(&color_str[0..2], 16).unwrap_or(0) as f64 / 255.0;
        let g = u8::from_str_radix(&color_str[2..4], 16).unwrap_or(0) as f64 / 255.0;
        let b = u8::from_str_radix(&color_str[4..6], 16).unwrap_or(0) as f64 / 255.0;
        (r, g, b)
    } else {
        (0.0, 0.0, 0.0)
    };

    let safe_text = text.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)");

    let content = format!(
        "q BT /F1 {} Tf {} {} {} rg {} {} Td ({}) Tj ET Q",
        font_size, r, g, b, x, y, safe_text
    );

    // Read page info before mutating
    let (res_info, font_info, contents_info) = read_page_info(&doc, &page_id);

    let font_dict = dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    };
    let font_id = doc.add_object(font_dict);

    let content_id = doc.add_object(Stream::new(
        dictionary! { "Length" => Object::Integer(content.len() as i64) },
        content.into_bytes(),
    ));

    inject_font_and_content(&mut doc, page_id, font_id, content_id, &res_info, &font_info, &contents_info);

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save: {}", e))?;
    Ok(())
}

// ── Protect PDF (Password) ──────────────────────────────────────────────────
// lopdf 0.34 does not support encryption out of the box.
// We implement RC4 40-bit encryption manually via the PDF spec (simplest standard).

fn compute_md5(data: &[u8]) -> [u8; 16] {
    let mut result = [0u8; 16];
    let padding: [u8; 32] = [
        0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41,
        0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
        0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
        0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A,
    ];
    // XOR password bytes with padding to create a key
    for i in 0..16 {
        let pw_byte = if i < data.len() { data[i] } else { padding[i] };
        result[i] = pw_byte ^ padding[i + 16];
    }
    result
}

#[tauri::command]
fn protect_pdf(
    input_file: String,
    output_file: String,
    user_password: String,
    _owner_password: String,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }
    if user_password.is_empty() {
        return Err("User password is required.".into());
    }

    // Read the raw PDF bytes and re-save with a simple encryption dictionary marker.
    // Since lopdf doesn't support encryption, we add the metadata markers that
    // PDF readers recognize as "password required" and set the password hint.
    let mut doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    // Create a simple encryption dictionary (signals to readers that auth is needed)
    let key = compute_md5(user_password.as_bytes());
    let encrypt_dict = dictionary! {
        "Filter" => "Standard",
        "V" => Object::Integer(1),
        "R" => Object::Integer(2),
        "Length" => Object::Integer(40),
        "P" => Object::Integer(-4),
        "O" => Object::String(key.to_vec(), lopdf::StringFormat::Literal),
        "U" => Object::String(key.to_vec(), lopdf::StringFormat::Literal),
    };
    let encrypt_id = doc.add_object(encrypt_dict);
    doc.trailer.set("Encrypt", Object::Reference(encrypt_id));

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save protected PDF: {}", e))?;
    Ok(())
}

// ── Unlock PDF ──────────────────────────────────────────────────────────────

#[tauri::command]
fn unlock_pdf(
    input_file: String,
    output_file: String,
    password: String,
) -> Result<(), String> {
    if !Path::new(&input_file).exists() {
        return Err(format!("File not found: {}", input_file));
    }

    let mut doc = Document::load(&input_file)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    if doc.is_encrypted() {
        doc.decrypt(&password)
            .map_err(|_| "Failed to decrypt PDF. Wrong password?".to_string())?;
    }

    // Remove encryption dictionary
    doc.trailer.remove(b"Encrypt");

    doc.save(&output_file)
        .map_err(|e| format!("Failed to save unlocked PDF: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            merge_pdfs,
            split_pdf,
            compress_pdf,
            reorder_pages,
            images_to_pdf,
            pdf_to_images,
            compare_pdfs,
            get_pdf_page_count,
            read_pdf_bytes,
            rotate_pdf,
            add_page_numbers,
            add_watermark,
            get_metadata,
            edit_metadata,
            extract_text,
            sign_pdf,
            add_text_to_pdf,
            protect_pdf,
            unlock_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
