import { Injectable } from '@angular/core';
import { CanvasStore } from './canvas.store';

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
        a.download = filename || `vec-${Date.now()}.json`;
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
} 