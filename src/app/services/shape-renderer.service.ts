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
                item.fillColor = new paper.Color(style.fill);
            } else {
                // Directly assign Paper.js Color or gradient object
                (item as any).fillColor = style.fill;
            }
        } else {
            // Clear fill when disabled or absent
            (item as any).fillColor = null;
        }
        // Stroke (respect strokeEnabled flag)
        if (style.strokeEnabled && style.stroke) {
            item.strokeColor = new paper.Color(style.stroke);
        } else {
            item.strokeColor = null;
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
    }
} 