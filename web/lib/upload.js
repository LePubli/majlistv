// Envoi d'un fichier par morceaux (multipart S3) directement vers le stockage, avec progression et reprise.
function putPart(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve(xhr.getResponseHeader('ETag'))
      : reject(new Error('HTTP ' + xhr.status)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(blob);
  });
}

// Renvoie l'identifiant d'upload à associer à la vidéo.
export async function uploadFile(file, call, onProgress) {
  const start = await call('/uploads', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type }),
  });
  if (!start.ok) throw new Error(start.status === 413 ? 'tooBig' : 'start');
  const { id, partSize, urls } = start.data;
  const loaded = new Array(urls.length).fill(0);
  const parts = new Array(urls.length);
  let next = 0;
  const report = () => onProgress(loaded.reduce((a, b) => a + b, 0) / file.size);

  // 3 morceaux en parallèle, 3 tentatives chacun.
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const blob = file.slice(i * partSize, (i + 1) * partSize);
      for (let attempt = 1; ; attempt++) {
        try {
          const etag = await putPart(urls[i], blob, (n) => { loaded[i] = n; report(); });
          if (!etag) throw new Error('etag');
          parts[i] = { PartNumber: i + 1, ETag: etag };
          loaded[i] = blob.size;
          report();
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
        }
      }
    }
  };
  try {
    await Promise.all([worker(), worker(), worker()]);
  } catch (err) {
    await call('/uploads/' + id, { method: 'DELETE' });
    throw err;
  }
  const done = await call(`/uploads/${id}/complete`, { method: 'POST', body: JSON.stringify({ parts }) });
  if (!done.ok) throw new Error('complete');
  return id;
}
