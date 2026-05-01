import JSZip from 'jszip'

export async function fixDocxImages(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(arrayBuffer)

  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'))
  const wdpFiles = mediaFiles.filter(f => f.toLowerCase().endsWith('.wdp') || f.toLowerCase().endsWith('.jxr'))
  const pngFiles = mediaFiles.filter(f => f.toLowerCase().endsWith('.png'))
  const jpgFiles = mediaFiles.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'))

  // FIX 1: Ensure all standard PNG and JPG images are kept as-is
  // (docx-preview with useBase64URL:true should handle these — we just verify they exist)
  const imageCount = pngFiles.length + jpgFiles.length
  console.log(`[fixDocxImages] Found ${imageCount} standard images, ${wdpFiles.length} WDP images`)

  // FIX 2: Replace unsupported .wdp (Windows HD Photo / JPEG XR) files
  // with a transparent 1x1 PNG so docx-preview doesn't break the layout.
  // Browsers cannot render .wdp natively — not Chrome, Firefox, or Safari.
  if (wdpFiles.length > 0) {
    // Minimal valid 1x1 transparent PNG (base64 decoded)
    const transparentPng1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const pngBytes = Uint8Array.from(atob(transparentPng1x1), c => c.charCodeAt(0))

    for (const wdpPath of wdpFiles) {
      const newPath = wdpPath.replace(/\.(wdp|jxr)$/i, '.png')
      zip.remove(wdpPath)
      zip.file(newPath, pngBytes)
      console.log(`[fixDocxImages] Replaced ${wdpPath} → ${newPath}`)
    }

    // Update [Content_Types].xml
    const ctFile = zip.files['[Content_Types].xml']
    if (ctFile) {
      let ct = await ctFile.async('string')
      ct = ct.replace(/ContentType="image\/vnd\.ms-photo"/g, 'ContentType="image/png"')
      ct = ct.replace(/Extension="wdp"/gi, 'Extension="png"')
      ct = ct.replace(/Extension="jxr"/gi, 'Extension="png"')
      zip.file('[Content_Types].xml', ct)
    }

    // Update all .rels files to point to .png instead of .wdp/.jxr
    const relsFiles = Object.keys(zip.files).filter(f => f.endsWith('.rels'))
    for (const relsPath of relsFiles) {
      const relsFile = zip.files[relsPath]
      let relsXml = await relsFile.async('string')
      if (relsXml.includes('.wdp') || relsXml.includes('.jxr')) {
        relsXml = relsXml.replace(/\.wdp"/gi, '.png"').replace(/\.jxr"/gi, '.png"')
        // Also replace the Microsoft hdphoto relationship type with standard image type
        relsXml = relsXml.replace(
          /http:\/\/schemas\.microsoft\.com\/office\/2007\/relationships\/hdphoto/g,
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
        )
        zip.file(relsPath, relsXml)
        console.log(`[fixDocxImages] Updated rels: ${relsPath}`)
      }
    }
  }

  return await zip.generateAsync({ type: 'arraybuffer' })
}
