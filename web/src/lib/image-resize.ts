/**
 * Shrinks a picture the person picked in the browser so it uploads quickly and fits the server's limit:
 * at most `maxSide` pixels on the longest side, saved as JPEG, lowering the quality until it is under `maxChars`.
 * Returns a data: URL. Throws a readable Error for files that are not pictures.
 */
export async function resizeImage(file: File, options: { maxSide: number; maxChars: number; square?: boolean }): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP or GIF picture.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That picture is too large (over 15 MB).");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That picture could not be read.");
  });
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (options.square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = side;
    sh = side;
  }
  const scale = Math.min(1, options.maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the picture.");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.72, 0.6, 0.48, 0.36]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= options.maxChars) return dataUrl;
  }
  throw new Error("That picture is too detailed to upload. Try a different one.");
}
