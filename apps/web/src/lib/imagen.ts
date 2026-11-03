/** Achica la foto a máx. 1280 px y la pasa a WebP (≈ 100–250 KB) antes de subirla.
 * Safari viejo no sabe hacer WebP: ahí sale JPEG. */
export async function comprimirFoto(archivo: File, ladoMax = 1280, calidad = 0.8): Promise<Blob> {
  const imagen = await createImageBitmap(archivo)
  const escala = Math.min(1, ladoMax / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d')?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()
  const aBlob = (tipo: string) => new Promise<Blob | null>((ok) => lienzo.toBlob(ok, tipo, calidad))
  let blob = await aBlob('image/webp')
  if (blob?.type !== 'image/webp') blob = await aBlob('image/jpeg')
  if (!blob) throw new Error('No pudimos procesar esa foto. Prueba con otra.')
  return blob
}
