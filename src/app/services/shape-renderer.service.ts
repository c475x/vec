import { Injectable } from '@angular/core';
import paper from 'paper';
import { Shape, PathShape, RectangleShape, EllipseShape, TextShape, ImageShape, GroupShape, ShapeStyle } from '../models/shape.model';

@Injectable({ providedIn: 'root' })
export class ShapeRendererService {
    createPaperItem(shape: Shape): paper.Item | null {
        let item: paper.Item | null = null;
        switch (shape.type) {
            case 'path':
                item = this.createPath(shape as PathShape);
                break;
            case 'rectangle':
                item = this.createRectangle(shape as RectangleShape);
                break;
            case 'ellipse':
                item = this.createEllipse(shape as EllipseShape);
                break;
            case 'text':
                item = this.createText(shape as TextShape);
                break;
            case 'image':
                item = this.createImage(shape as ImageShape);
                break;
            case 'group':
                item = this.createGroup(shape as GroupShape);
                break;
        }
        // Apply style except for images and groups
        if (item && shape.type !== 'image' && shape.type !== 'group') {
            this.applyStyle(item, shape.style);
        }
        return item;
    }

    private createPath(shape: PathShape): paper.Path {
        const path = new paper.Path();
        path.segments = shape.segments.map(seg => new paper.Segment(
            new paper.Point(seg.point.x, seg.point.y),
            seg.handleIn ? new paper.Point(seg.handleIn.x, seg.handleIn.y) : undefined,
            seg.handleOut ? new paper.Point(seg.handleOut.x, seg.handleOut.y) : undefined
        ));
        path.closed = shape.closed;
        return path;
    }

    private createRectangle(shape: RectangleShape): paper.Path.Rectangle {
        return new paper.Path.Rectangle({
            rectangle: new paper.Rectangle(
                shape.topLeft.x,
                shape.topLeft.y,
                shape.size.width,
                shape.size.height
            ),
            radius: shape.radius || 0
        });
    }

    private createEllipse(shape: EllipseShape): paper.Path.Ellipse {
        return new paper.Path.Ellipse({
            center: new paper.Point(shape.center.x, shape.center.y),
            radius: new paper.Size(shape.radius.width, shape.radius.height)
        });
    }

    private createText(shape: TextShape): paper.PointText {
        return new paper.PointText({
            point: new paper.Point(shape.position.x, shape.position.y),
            content: shape.content,
            fontSize: shape.fontSize,
            fontFamily: shape.fontFamily,
            justification: shape.justification as any
        });
    }

    private createImage(shape: ImageShape): paper.Item {
        // Create raster and set position and size
        const raster = new paper.Raster({ source: shape.source });
        raster.position = new paper.Point(shape.position.x, shape.position.y);
        raster.size = new paper.Size(shape.size.width, shape.size.height);
        // Apply shadow settings to raster
        if (shape.style.shadowColor) {
            raster.shadowColor = new paper.Color(shape.style.shadowColor);
        }
        if (shape.style.shadowBlur !== undefined) {
            raster.shadowBlur = shape.style.shadowBlur;
        }
        if (shape.style.shadowOffset) {
            raster.shadowOffset = new paper.Point(shape.style.shadowOffset.x, shape.style.shadowOffset.y);
        }
        if (shape.style.shadowOpacity !== undefined && raster.shadowColor) {
            raster.shadowColor.alpha = shape.style.shadowOpacity;
        }
        // Create group for clipping and borders
        const group = new paper.Group();
        // Add raster
        group.addChild(raster);
        // Draw stroke border
        if (shape.style.strokeEnabled && shape.style.stroke) {
            const border = new paper.Path.Rectangle({
                rectangle: raster.bounds,
                strokeColor: new paper.Color(shape.style.stroke),
                strokeWidth: shape.style.strokeWidth || 1,
                fillColor: null
            });
            group.addChild(border);
        }
        // Apply opacity to group
        if (shape.style.opacity !== undefined) {
            group.opacity = shape.style.opacity;
        }
        return group;
    }

    private createGroup(shape: GroupShape): paper.Group {
        const group = new paper.Group();
        shape.children.forEach(child => {
            const item = this.createPaperItem(child);
            if (item) group.addChild(item);
        });
        return group;
    }

    private applyStyle(item: paper.Item, style: ShapeStyle): void {
        // Fill (respect fillEnabled flag)
        if (style.fillEnabled && style.fill) {
            if (typeof style.fill === 'string') {
                // Solid color
                item.fillColor = new paper.Color(style.fill);
            } else if ((style.fill as any).gradient) {
                // Paper.js Gradient
                (item as any).fillColor = style.fill as any;
            } else {
                // Domain Gradient object
                const g = style.fill as any;
                // Map domain stops to paper.Color stops
                const stops: [paper.Color, number][] = g.stops.map((s: any) => [new paper.Color(s.color), s.offset]);
                // Create a gradient, pass radial flag
                const gradient = new (paper as any).Gradient(stops, g.type === 'radial');
                const bounds = (item as any).bounds as paper.Rectangle;
                const originPt = new paper.Point(
                    bounds.x + g.origin.x * bounds.width,
                    bounds.y + g.origin.y * bounds.height
                );
                let destPt: paper.Point;
                if (g.type === 'linear') {
                    destPt = new paper.Point(
                        bounds.x + g.destination.x * bounds.width,
                        bounds.y + g.destination.y * bounds.height
                    );
                } else {
                    // For radial, set destination horizontally at desired radius
                    destPt = new paper.Point(
                        originPt.x + g.radius * Math.max(bounds.width, bounds.height),
                        originPt.y
                    );
                }
                // Assign fillColor via paper.Color to render gradient
                item.fillColor = new (paper as any).Color(gradient, originPt, destPt);
            }
        } else {
            // Clear fill when disabled or absent
            item.fillColor = null;
            // If shadow present and no fill, add transparent fill to trigger shadow render
            if (style.shadowColor && style.shadowBlur !== undefined && style.shadowBlur > 0) {
                const transFill = new paper.Color(style.shadowColor);
                transFill.alpha = 0;
                item.fillColor = transFill;
            }
        }
        // Stroke (respect strokeEnabled flag)
        if (style.strokeEnabled && style.stroke) {
            item.strokeColor = new paper.Color(style.stroke);
        } else {
            // Clear stroke when disabled, but add transparent stroke if shadow present
            if (style.shadowColor && style.shadowBlur !== undefined && style.shadowBlur > 0) {
                const transStroke = new paper.Color(style.shadowColor);
                transStroke.alpha = 0;
                item.strokeColor = transStroke;
            } else {
                item.strokeColor = null;
            }
        }
        // Stroke width
        if (style.strokeWidth !== undefined) {
            item.strokeWidth = style.strokeWidth;
        }
        // Opacity
        if (style.opacity !== undefined) {
            item.opacity = style.opacity;
        }
        // Shadow
        if (style.shadowColor) {
            item.shadowColor = new paper.Color(style.shadowColor);
        }
        if (style.shadowBlur !== undefined) {
            item.shadowBlur = style.shadowBlur;
        }
        if (style.shadowOffset) {
            item.shadowOffset = new paper.Point(style.shadowOffset.x, style.shadowOffset.y);
        }
        if (style.shadowOpacity !== undefined && item.shadowColor) {
            item.shadowColor.alpha = style.shadowOpacity;
        }
    }
} 