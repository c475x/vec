import { Injectable } from '@angular/core';
import { CanvasStore } from './canvas.store';
import paper from 'paper';
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

    /** Export current selection (or all) as SVG */
    exportSVG(): void {
        console.debug('SVG Export: starting');
        const shapes = this.store.shapes$.value;
        const sel = this.store.selectedIds$.value;
        // Determine shapes to export: if groups selected, flatten to their children
        const rawShapes = sel.size > 0
            ? shapes.filter(s => sel.has(s.id))
            : shapes;
        const exportShapes = rawShapes.flatMap(s =>
            s.type === 'group'
                ? (s as import('../models/shape.model').GroupShape).children
                : [s]
        );
        // Compute bounds over exportShapes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        exportShapes.forEach(s => {
            if ((s as any).paperObject) {
                const b = (s as any).paperObject.bounds as paper.Rectangle;
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
            }
        });
        if (minX === Infinity) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
        const width = maxX - minX;
        const height = maxY - minY;
        console.debug('SVG Export: bounds', { minX, minY, width, height });
        // Generate defs for gradients and shadows
        let defs = '';
        const gradIds = new Set<number>();
        exportShapes.forEach(s => {
            if (s.type === 'path' && s.style.fill && typeof s.style.fill !== 'string' && !(s.style.fill as any).gradient) {
                // domain gradient
                const g = s.style.fill as any;
                const gid = 'grad' + s.id;
                if (!gradIds.has(s.id)) {
                    gradIds.add(s.id);
                    if (g.type === 'linear') {
                        const x1 = minX + g.origin.x * width;
                        const y1 = minY + g.origin.y * height;
                        const x2 = minX + g.destination.x * width;
                        const y2 = minY + g.destination.y * height;
                        defs += `<linearGradient id="${gid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">`;
                        g.stops.forEach((stop: any) => {
                            defs += `<stop offset="${stop.offset}" stop-color="${stop.color}" />`;
                        });
                        defs += `</linearGradient>`;
                    } else if (g.type === 'radial') {
                        const cx = minX + g.origin.x * width;
                        const cy = minY + g.origin.y * height;
                        const r = g.radius;
                        defs += `<radialGradient id="${gid}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">`;
                        g.stops.forEach((stop: any) => {
                            defs += `<stop offset="${stop.offset}" stop-color="${stop.color}" />`;
                        });
                        defs += `</radialGradient>`;
                    }
                }
            }
            // Add shadow filter definitions
            const blur = s.style.shadowBlur ?? 0;
            const off = s.style.shadowOffset ?? { x: 0, y: 0 };
            if (blur > 0 || off.x !== 0 || off.y !== 0) {
                const color = s.style.shadowColor ?? '#000';
                const opacity = s.style.shadowOpacity ?? 1;
                const sid = 'shadow' + s.id;
                defs += `<filter id="${sid}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${off.x}" dy="${off.y}" stdDeviation="${blur}" flood-color="${color}" flood-opacity="${opacity}"/></filter>`;
            }
        });
        if (defs) {
            defs = `<defs>${defs}</defs>`;
        }
        // Build shape markup
        const shapeMarkup = exportShapes.map(s => {
            console.debug('SVG Export: shape', s);
            switch (s.type) {
                case 'path': {
                    const p = s as import('../models/shape.model').PathShape;
                    // build d
                    let d = '';
                    p.segments.forEach((seg, i) => {
                        const pt = seg.point;
                        if (i === 0) {
                            d += `M ${pt.x - minX} ${pt.y - minY}`;
                        } else {
                            const prev = p.segments[i - 1];
                            if (prev.handleOut || seg.handleIn) {
                                // compute control points manually (plain objects) instead of using .add()
                                const cp1 = prev.handleOut
                                    ? { x: prev.point.x + prev.handleOut.x, y: prev.point.y + prev.handleOut.y }
                                    : { x: prev.point.x, y: prev.point.y };
                                const cp2 = seg.handleIn
                                    ? { x: pt.x + seg.handleIn.x, y: pt.y + seg.handleIn.y }
                                    : { x: pt.x, y: pt.y };
                                d += ` C ${cp1.x - minX} ${cp1.y - minY}, ${cp2.x - minX} ${cp2.y - minY}, ${pt.x - minX} ${pt.y - minY}`;
                            } else {
                                d += ` L ${pt.x - minX} ${pt.y - minY}`;
                            }
                        }
                    });
                    if (p.closed) {
                        // emit closing bezier curve back to first segment
                        const firstSeg = p.segments[0];
                        const prevSeg = p.segments[p.segments.length - 1];
                        // control point 1 from prevSeg.handleOut
                        const c1 = prevSeg.handleOut
                            ? { x: prevSeg.point.x + prevSeg.handleOut.x, y: prevSeg.point.y + prevSeg.handleOut.y }
                            : { x: prevSeg.point.x, y: prevSeg.point.y };
                        // control point 2 from firstSeg.handleIn
                        const c2 = firstSeg.handleIn
                            ? { x: firstSeg.point.x + firstSeg.handleIn.x, y: firstSeg.point.y + firstSeg.handleIn.y }
                            : { x: firstSeg.point.x, y: firstSeg.point.y };
                        d += ` C ${c1.x - minX} ${c1.y - minY}, ${c2.x - minX} ${c2.y - minY}, ${firstSeg.point.x - minX} ${firstSeg.point.y - minY}`;
                        d += ' Z';
                    }
                    const style = p.style;
                    const fill = typeof style.fill === 'string'
                        ? style.fill
                        : style.fill && !(style.fill as any).gradient
                            ? `url(#grad${s.id})`
                            : 'none';
                    const stroke = style.strokeEnabled && style.stroke ? style.stroke : 'none';
                    const strokeWidth = style.strokeWidth || 1;
                    const opacity = style.opacity != null ? style.opacity : 1;
                    // attach shadow filter if present
                    const hasShadow = (style.shadowBlur ?? 0) > 0 || (style.shadowOffset?.x ?? 0) !== 0 || (style.shadowOffset?.y ?? 0) !== 0;
                    const filterAttr = hasShadow ? ` filter="url(#shadow${s.id})"` : '';
                    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${filterAttr}/>`;
                }
                case 'text': {
                    const t = s as import('../models/shape.model').TextShape;
                    const x = t.position.x - minX;
                    const y = t.position.y - minY;
                    const style = t.style;
                    const hasShadowT = (style.shadowBlur ?? 0) > 0 || (style.shadowOffset?.x ?? 0) !== 0 || (style.shadowOffset?.y ?? 0) !== 0;
                    const filterT = hasShadowT ? ` filter="url(#shadow${s.id})"` : '';
                    return `<text x="${x}" y="${y}" font-family="${t.fontFamily}" font-size="${t.fontSize}" fill="${t.style.fill}" opacity="${t.style.opacity}"${filterT}>${t.content}</text>`;
                }
                case 'image': {
                    const img = s as import('../models/shape.model').ImageShape;
                    const x = img.position.x - img.size.width/2 - minX;
                    const y = img.position.y - img.size.height/2 - minY;
                    console.debug('SVG Export: image', img.source, x, y, img.size.width, img.size.height);
                    const styleI = img.style;
                    const hasShadowI = (styleI.shadowBlur ?? 0) > 0 || (styleI.shadowOffset?.x ?? 0) !== 0 || (styleI.shadowOffset?.y ?? 0) !== 0;
                    const filterI = hasShadowI ? ` filter="url(#shadow${s.id})"` : '';
                    return `<image href="${img.source}" x="${x}" y="${y}" width="${img.size.width}" height="${img.size.height}"${filterI}/>`;
                }
                default:
                    return '';
            }
        }).join('');
        // Build SVG
        const vecComment = '<!-- created with vec -->\n';
        const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
        const prettyDefs = defs ? defs.replace(/></g, '>\n  <') + '\n' : '';
        const prettyShapes = shapeMarkup.replace(/></g, '>\n  <') + '\n';
        const svg = vecComment + svgOpen + prettyDefs + prettyShapes + '</svg>';
        const cleanedSvg = svg.replace(/<</g, '<');
        console.debug('SVG Export: cleaned svg markup:', cleanedSvg);
        const blob = new Blob([cleanedSvg], { type: 'image/svg+xml' });
        const filename = `vec-export-${new Date().toISOString().replace(/[:.]/g, '-')}.svg`;
        this.downloadBlob(blob, filename);
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