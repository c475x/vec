import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tool } from '../../models/tool.enum';
import { CanvasStore } from '../../services/canvas.store';

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

    constructor(private store: CanvasStore) { }

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

    exportJSON(): void {
        const data = JSON.stringify(this.store.shapes$.value, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'vec-' + Date.now() + '.json'; a.click();
        URL.revokeObjectURL(url);
    }

    loadJSON(): void {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const rdr = new FileReader();
            rdr.onload = () => {
                try {
                    const arr: any[] = JSON.parse(rdr.result as string);
                    this.store.updateShapes((sh: any[]) => {
                        sh.splice(0, sh.length, ...arr);
                    });
                } catch {
                    alert('Invalid JSON');
                }
            };
            rdr.readAsText(file);
        };
        input.click();
    }

    importImage(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                const src = reader.result as string;
                const img = new Image();
                img.onload = () => {
                    const shape: any = {
                        id: Date.now(),
                        type: 'image',
                        x: 50,
                        y: 50,
                        w: img.width,
                        h: img.height,
                        src,
                        _img: img
                    };
                    this.store.updateShapes(arr => arr.push(shape));
                    this.store.select(shape.id);
                };
                img.src = src;
            };
            reader.readAsDataURL(file);
        };

        input.click();
    }
}
