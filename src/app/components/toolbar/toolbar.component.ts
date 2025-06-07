import { Component, EventEmitter, Input, Output, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tool } from '../../models/tool.enum';
import { CanvasStore } from '../../services/canvas.store';
import { ExportService } from '../../services/export.service';
import { ImageShape, PathShape, GroupShape, ShapeStyle } from '../../models/shape.model';
import paper from 'paper';

@Component({
    selector: 'app-toolbar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './toolbar.component.html',
    styleUrl: './toolbar.component.scss'
})
export class ToolbarComponent {
    @Input()  active: Tool = Tool.Move;
    @Output() toolChange = new EventEmitter<Tool>();
    @ViewChild('fileInput', { static: true }) fileInput!: ElementRef<HTMLInputElement>;

    constructor(private store: CanvasStore, public exportService: ExportService) { }

    tools = [
        Tool.Move,
        Tool.Pen,
        Tool.Rect,
        Tool.Line,
        Tool.Ellipse,
        Tool.Text,
        Tool.Comment
    ];

    selectTool(t: Tool) {
        this.active = t;
        this.toolChange.emit(t);
    }

    iconFor(tool: Tool): string {
        return `icons/tools/${tool}.svg`;
    }

    onImportImage(): void {
        this.fileInput.nativeElement.value = '';
        this.fileInput.nativeElement.click();
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files || !input.files.length) return;
        const file = input.files[0];
        // Handle SVG import separately
        if (file.type === 'image/svg+xml') {
            const reader = new FileReader();
            reader.onload = () => {
                const svgText = reader.result as string;
                this.importSVGText(svgText);
            };
            reader.readAsText(file);
            return;
        }
        // Raster import (PNG, JPG)
        const reader = new FileReader();
        reader.onload = () => {
            const src = reader.result as string;
            // Preload to get real dimensions
            const imgEl = new Image();
            imgEl.onload = () => {
                const width = imgEl.naturalWidth;
                const height = imgEl.naturalHeight;
                const center = paper.view.center;
                const activeStyle = this.store.activeStyle$.value;
                const style = { ...activeStyle, fillEnabled: false, strokeEnabled: false };
                const shape: ImageShape = {
                    id: Date.now(),
                    type: 'image',
                    source: src,
                    position: new paper.Point(center.x, center.y),
                    size: new paper.Size(width, height),
                    style
                };
                this.store.updateShapes(shapes => shapes.push(shape));
                this.store.select(shape.id);
            };
            imgEl.src = src;
        };
        reader.readAsDataURL(file);
    }

    private importSVGText(svgText: string): void {
        // Import SVG without inserting into DOM
        const item = paper.project.importSVG(svgText, { expandShapes: true, insert: false });
        // Collect all Path items
        const paths: paper.Path[] = [];
        const collect = (it: paper.Item) => {
            if (it instanceof paper.Path) paths.push(it);
            if (it instanceof paper.Group) it.children.forEach(collect);
        };
        collect(item);
        // Remove imported item from project
        item.remove();
        // Convert each Path to our PathShape
        const shapes: PathShape[] = paths.map((path, idx) => {
            const segments = path.segments.map(seg => ({
                point: { x: seg.point.x, y: seg.point.y },
                handleIn: seg.handleIn && { x: seg.handleIn.x, y: seg.handleIn.y },
                handleOut: seg.handleOut && { x: seg.handleOut.x, y: seg.handleOut.y }
            }));
            // Build style with gradient support
            let fillVal: string | paper.Gradient | undefined;
            let fillEnabled = false;
            if (path.fillColor) {
                fillEnabled = true;
                if ((path.fillColor as any).gradient) {
                    fillVal = (path.fillColor as any).gradient as paper.Gradient;
                } else {
                    fillVal = path.fillColor.toCSS(true)!;
                }
            }
            const style: ShapeStyle = {
                stroke: path.strokeColor?.toCSS(true),
                strokeEnabled: !!path.strokeColor,
                strokeWidth: path.strokeWidth,
                fill: fillVal,
                fillEnabled,
                opacity: path.opacity,
                shadowBlur: path.shadowBlur,
                shadowOffset: { x: path.shadowOffset.x, y: path.shadowOffset.y },
                shadowColor: path.shadowColor?.toCSS(true)
            };
            return { id: Date.now() + idx, type: 'path', segments, closed: path.closed, style } as PathShape;
        });
        if (!shapes.length) return;
        if (shapes.length === 1) {
            this.store.updateShapes(arr => arr.push(shapes[0]));
            this.store.select(shapes[0].id);
        } else {
            const group: GroupShape = { id: Date.now(), type: 'group', children: shapes, style: this.store.activeStyle$.value };
            this.store.updateShapes(arr => arr.push(group));
            this.store.select(group.id);
        }
    }
}
