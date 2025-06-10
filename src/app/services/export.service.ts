import { Injectable } from '@angular/core';
import { CanvasStore } from './canvas.store';
import { Tool } from '../models/tool.enum';

@Injectable({ providedIn: 'root' })
export class ExportService {
    constructor(private store: CanvasStore) {}

    /** Export given shapes (or all) to JSON, serializing complete shape data */
    exportJSON(shapes?: any[], filename?: string): void {
        const dataShapes = (shapes ?? this.store.shapes$.value) as any[];
        // Serialize shapes to plain objects
        const serialized = dataShapes.map(s => this.serializeShape(s));
        const data = JSON.stringify(serialized, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `vec-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Import shapes from JSON file, replacing current shapes */
    importJSON(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const arr = JSON.parse(reader.result as string) as any[];
                    // Replace shapes in store with imported shapes
                    this.store.updateShapes(shapes => {
                        shapes.splice(0, shapes.length, ...arr);
                    });
                } catch {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /** Recursively convert a Shape model into plain JSON object */
    private serializeShape(s: any): any {
        const base: any = { id: s.id, type: s.type, style: s.style };
        switch (s.type) {
            case 'path': {
                const p = s as import('../models/shape.model').PathShape;
                return {
                    ...base,
                    segments: p.segments.map(seg => ({
                        point: { x: seg.point.x, y: seg.point.y },
                        handleIn: seg.handleIn ? { x: seg.handleIn.x, y: seg.handleIn.y } : undefined,
                        handleOut: seg.handleOut ? { x: seg.handleOut.x, y: seg.handleOut.y } : undefined
                    })),
                    closed: p.closed,
                    cornerRadius: (p as any).cornerRadius
                };
            }
            case 'text': {
                const t = s as import('../models/shape.model').TextShape;
                return {
                    ...base,
                    content: t.content,
                    position: { x: t.position.x, y: t.position.y },
                    fontSize: t.fontSize,
                    fontFamily: t.fontFamily,
                    justification: t.justification
                };
            }
            case 'image': {
                const img = s as import('../models/shape.model').ImageShape;
                return {
                    ...base,
                    source: img.source,
                    position: { x: img.position.x, y: img.position.y },
                    size: { width: img.size.width, height: img.size.height },
                    radius: (img as any).radius
                };
            }
            case 'group': {
                const g = s as import('../models/shape.model').GroupShape;
                return {
                    ...base,
                    children: g.children.map(child => this.serializeShape(child))
                };
            }
            default:
                return base;
        }
    }

    /** Export current selection (or all) as PNG or JPG by screenshotting the drawing canvas */
    async exportImage(format: 'png' | 'jpg'): Promise<void> {
        // Backup full shape list and selection
        const fullShapes = [...this.store.shapes$.value];
        const selIds = new Set(this.store.selectedIds$.value);
        // Compute bounding box including shadow padding of selected shapes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        fullShapes.forEach(s => {
            if (selIds.has(s.id) && s.paperObject) {
                const b = s.paperObject.bounds;
                const sb = s.style.shadowBlur ?? 0;
                const off = s.style.shadowOffset ?? { x: 0, y: 0 };
                const x1 = b.x + Math.min(0, off.x) - sb;
                const y1 = b.y + Math.min(0, off.y) - sb;
                const x2 = b.x + b.width + Math.max(0, off.x) + sb;
                const y2 = b.y + b.height + Math.max(0, off.y) + sb;
                minX = Math.min(minX, x1);
                minY = Math.min(minY, y1);
                maxX = Math.max(maxX, x2);
                maxY = Math.max(maxY, y2);
            }
        });
        // If no selection, fallback to full canvas
        const canvasEl = document.querySelector('canvas.drawing-canvas') as HTMLCanvasElement;
        if (!canvasEl) {
            console.error('Canvas element not found');
            return;
        }
        if (minX === Infinity) {
            minX = 0;
            minY = 0;
            maxX = canvasEl.width;
            maxY = canvasEl.height;
        }
        // Hide hover outlines and clear selection to hide any bounding boxes
        this.store.hideHover$.next(true);
        this.store.clearSelection();
        // Record and suppress tool to prevent hover outline rendering
        const prevTool = this.store.activeTool$.value;
        this.store.setActiveTool(Tool.Comment);
        // Temporarily restrict store to selected shapes only when exporting a selection
        if (selIds.size > 0) {
            this.store.shapes$.next(fullShapes.filter(s => selIds.has(s.id)));
        }
        // Wait a frame for canvas to update
        await new Promise(requestAnimationFrame);
        // Create offscreen canvas to crop region
        const width = Math.round(maxX - minX);
        const height = Math.round(maxY - minY);
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) {
            console.error('Failed to get 2D context');
            // Restore
            this.store.shapes$.next(fullShapes);
            this.store.selectedIds$.next(selIds);
            this.store.setActiveTool(prevTool);
            this.store.hideHover$.next(false);
            return;
        }
        // Draw the cropped area from the on-screen canvas
        ctx.drawImage(canvasEl, minX, minY, width, height, 0, 0, width, height);
        // Export blob
        exportCanvas.toBlob(blob => {
            if (blob) {
                const filename = `vec-export-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
                this.downloadBlob(blob, filename);
            }
            // Restore original state: shapes, selection, tool, hover
            this.store.shapes$.next(fullShapes);
            this.store.selectedIds$.next(selIds);
            this.store.setActiveTool(prevTool);
            this.store.hideHover$.next(false);
        }, format === 'jpg' ? 'image/jpeg' : 'image/png');
    }

    /** Placeholder for SVG export of current selection */
    exportSVG(): void {
        console.warn('SVG export not implemented');
    }

    /** Download a blob as a file */
    private downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
} 