import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tool } from '../../models/tool.enum';
import { CanvasStore } from '../../services/canvas.store';
import { VectorShape } from '../../models/shape.model';

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
            if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
                reader.onload = () => {
                    const svgText = reader.result as string;
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(svgText, 'image/svg+xml');
                    const paths = Array.from(doc.querySelectorAll('path'));
                    if (paths.length === 0) {
                        alert('Selected SVG does not contain any <path> tags.');
                        return;
                    }

                    // читаем все d
                    let globalMinX = Infinity, globalMinY = Infinity;
                    const ds = paths.map(p => {
                        // убираем transform, если есть
                        const transform = p.getAttribute('transform');
                        if (transform) {
                            p.removeAttribute('transform');
                        }
                        const d = p.getAttribute('d') || '';
                        return d;
                    });

                    // чтобы корректно вычислить bb всех путей, создаём временный svg
                    const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    tmpSvg.style.position = 'absolute';
                    tmpSvg.style.opacity = '0';
                    document.body.appendChild(tmpSvg);

                    const collected: { d: string; bbox: DOMRect }[] = [];
                    ds.forEach(d => {
                        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        pathEl.setAttribute('d', d);
                        tmpSvg.appendChild(pathEl);
                        const box = pathEl.getBBox();
                        collected.push({ d, bbox: box });
                        globalMinX = Math.min(globalMinX, box.x);
                        globalMinY = Math.min(globalMinY, box.y);
                    });
                    document.body.removeChild(tmpSvg);

                    const shapes: VectorShape[] = collected.map(({ d, bbox }) => ({
                        id: Date.now() + Math.random(),  // уникальный
                        type: 'vector',
                        path: d,
                        x: -globalMinX,
                        y: -globalMinY,
                        scaleX: 1,
                        scaleY: 1,
                        style: { ...this.store.activeStyle$.value }
                    }));

                    if (shapes.length > 1) {
                        // добавляем их в стор как группу
                        this.store.updateShapes(arr => {
                            arr.push({
                                id: Date.now(),
                                type: 'group',
                                children: shapes,
                                style: { ...this.store.activeStyle$.value }
                            });
                        });
                        // выбираем сразу всю группу
                        this.store.select(shapes[0].id);
                    } else {
                        // добавляем единственный path
                        this.store.updateShapes(arr => arr.push(shapes[0]));
                        this.store.select(shapes[0].id);
                    }
                };

                reader.readAsText(file);
            } else {
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
            }
        };

        input.click();
    }
}
