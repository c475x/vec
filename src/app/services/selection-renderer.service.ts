import { Injectable } from '@angular/core';
import paper from 'paper';

export interface BoundingBoxConfig {
    padding: number;
    strokeColor: string;
    strokeWidth: number;
    handleSize: number;
    handleFillColor: string;
    handleStrokeColor: string;
    handleStrokeWidth: number;
    selectionFillColor: string;
    dimensionsBoxHeight: number;
    dimensionsFontSize: number;
    dimensionsPadding: number;
    dimensionsYOffset: number;
}

export interface PaperItemWithId extends paper.Item {
    shapeId?: number;
}

@Injectable({ providedIn: 'root' })
export class SelectionRendererService {
    constructor() {}

    renderSelection(selectionLayer: paper.Layer, selectedItems: Set<PaperItemWithId>, config: BoundingBoxConfig): void {
        selectionLayer.removeChildren();
        // If multiple items selected, draw one common bounding box with handles and dimensions
        if (selectedItems.size > 1) {
            const items = Array.from(selectedItems);
            // Compute union of bounds
            let unionBounds = items[0].bounds.clone();
            for (let i = 1; i < items.length; i++) {
                unionBounds = unionBounds.unite(items[i].bounds);
            }
            const padding = config.padding;
            const expanded = unionBounds.expand(padding);
            // Draw outline
            const outline = new paper.Path.Rectangle({
                rectangle: expanded,
                strokeColor: new paper.Color(config.strokeColor),
                strokeWidth: config.strokeWidth,
                fillColor: null,
                radius: 0,
                opacity: 1,
                guide: false
            });
            selectionLayer.addChild(outline);
            // Draw resize handles
            const half = config.handleSize / 2;
            const handlePositions = [
                { point: expanded.topLeft, name: 'nw' },
                { point: expanded.topRight, name: 'ne' },
                { point: expanded.bottomRight, name: 'se' },
                { point: expanded.bottomLeft, name: 'sw' }
            ];
            handlePositions.forEach(h => {
                const rect = new paper.Path.Rectangle({
                    rectangle: new paper.Rectangle(
                        Math.round(h.point.x - half),
                        Math.round(h.point.y - half),
                        config.handleSize,
                        config.handleSize
                    ),
                    fillColor: new paper.Color(config.handleFillColor),
                    strokeColor: new paper.Color(config.handleStrokeColor),
                    strokeWidth: config.handleStrokeWidth,
                    opacity: 1,
                    data: { handle: h.name }
                });
                selectionLayer.addChild(rect);
            });
            // Draw dimensions for group/multi-select
            this.drawDimensions(selectionLayer, unionBounds, config);
            return;
        }
        // Single item: draw normal bounding box with handles
        selectedItems.forEach(item => {
            this.drawBoundingBox(selectionLayer, item, selectedItems.size, config);
        });
    }

    renderHover(guideLayer: paper.Layer, hoveredItem: paper.Item | null, config: BoundingBoxConfig): void {
        if (!hoveredItem) return;
        // Outline shape or bounding box for group
        if (hoveredItem instanceof paper.Group) {
            const bounds = hoveredItem.bounds.expand(config.padding);
            const outline = new paper.Path.Rectangle({
                rectangle: bounds,
                strokeColor: new paper.Color(config.strokeColor),
                strokeWidth: config.strokeWidth,
                fillColor: null
            });
            guideLayer.addChild(outline);
        } else {
            const outline = hoveredItem.clone({ insert: false });
            outline.strokeColor = new paper.Color(config.strokeColor);
            outline.strokeWidth = config.strokeWidth;
            outline.opacity = 1;
            outline.fillColor = null;
            // Clear shadow on hover outline
            outline.shadowColor = null;
            outline.shadowBlur = 0;
            outline.shadowOffset = new paper.Point(0, 0);
            guideLayer.addChild(outline);
            // Expose shapeId on hover outline for hit-testing
            (outline as any).shapeId = (hoveredItem as any).shapeId;
        }
    }

    renderMarquee(guideLayer: paper.Layer, start: paper.Point, end: paper.Point): void {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        const rect = new paper.Path.Rectangle({
            point: new paper.Point(x, y),
            size: new paper.Size(w, h),
            strokeColor: new paper.Color('#0c8ce9'),
            fillColor: new paper.Color('rgba(12,140,233,0.1)'),
            strokeWidth: 1,
            opacity: 1,
            guide: true
        });
        guideLayer.addChild(rect);
    }

    private drawBoundingBox(
        selectionLayer: paper.Layer,
        item: paper.Item,
        selectionCount: number,
        config: BoundingBoxConfig
    ): void {
        const bounds = item.bounds;
        const padding = config.padding;
        const expanded = bounds.expand(padding);
        // Box outline
        const outline = new paper.Path.Rectangle({
            rectangle: expanded,
            strokeColor: new paper.Color(config.strokeColor),
            strokeWidth: config.strokeWidth,
            fillColor: null,
            radius: 0,
            opacity: 1,
            selected: false,
            guide: false
        });
        selectionLayer.addChild(outline);

        if (selectionCount === 1) {
            const handleSize = config.handleSize;
            const half = handleSize / 2;
            const handles = [
                { point: expanded.topLeft, name: 'nw' },
                { point: expanded.topRight, name: 'ne' },
                { point: expanded.bottomRight, name: 'se' },
                { point: expanded.bottomLeft, name: 'sw' }
            ];
            handles.forEach(h => {
                const rect = new paper.Path.Rectangle({
                    rectangle: new paper.Rectangle(
                        Math.round(h.point.x - half),
                        Math.round(h.point.y - half),
                        handleSize,
                        handleSize
                    ),
                    fillColor: new paper.Color(config.handleFillColor),
                    strokeColor: new paper.Color(config.handleStrokeColor),
                    strokeWidth: config.handleStrokeWidth,
                    opacity: 1,
                    data: { handle: h.name }
                });
                selectionLayer.addChild(rect);
            });
            this.drawDimensions(selectionLayer, bounds, config);
        }
    }

    private drawDimensions(
        selectionLayer: paper.Layer,
        bounds: paper.Rectangle,
        config: BoundingBoxConfig
    ): void {
        const boxH = config.dimensionsBoxHeight;
        const yOff = config.dimensionsYOffset;
        const w = Math.round(bounds.width * 100) / 100;
        const h = Math.round(bounds.height * 100) / 100;
        const label = `${w} × ${h}`;
        const text = new paper.PointText({
            point: bounds.bottomCenter.add(new paper.Point(0, yOff + boxH / 2)),
            content: label,
            fillColor: new paper.Color('white'),
            fontSize: config.dimensionsFontSize,
            fontFamily: 'SF Pro Display',
            justification: 'center'
        });
        const pad = config.dimensionsPadding;
        const radius = 2;
        const box = new paper.Path();
        const b = new paper.Rectangle(
            text.bounds.left - pad,
            text.bounds.top - pad + 1,
            text.bounds.width + pad * 2,
            boxH
        );
        const tl = b.topLeft;
        const tr = b.topRight;
        const br = b.bottomRight;
        const bl = b.bottomLeft;
        box.moveTo(tl.add(new paper.Point(radius, 0)));
        box.lineTo(tr.add(new paper.Point(-radius, 0)));
        box.quadraticCurveTo(tr, tr.add(new paper.Point(0, radius)));
        box.lineTo(br.add(new paper.Point(0, -radius)));
        box.quadraticCurveTo(br, br.add(new paper.Point(-radius, 0)));
        box.lineTo(bl.add(new paper.Point(radius, 0)));
        box.quadraticCurveTo(bl, bl.add(new paper.Point(0, -radius)));
        box.lineTo(tl.add(new paper.Point(0, radius)));
        box.quadraticCurveTo(tl, tl.add(new paper.Point(radius, 0)));
        box.closePath();
        box.fillColor = new paper.Color(config.strokeColor);
        box.insertBelow(text);
        selectionLayer.addChild(text);
    }
} 