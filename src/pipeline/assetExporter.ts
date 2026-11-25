import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'polygen-asset'
  );
}

export async function exportAssetAsGLB(root: THREE.Object3D, title: string): Promise<number> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true });
  const buffer = result as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  triggerDownload(blob, `${sanitizeSlug(title)}.glb`);
  return Math.round(blob.size / 1024);
}

export function exportAssetAsOBJ(root: THREE.Object3D, title: string): number {
  const exporter = new OBJExporter();
  const objText = exporter.parse(root);
  const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `${sanitizeSlug(title)}.obj`);
  return Math.round(blob.size / 1024);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
