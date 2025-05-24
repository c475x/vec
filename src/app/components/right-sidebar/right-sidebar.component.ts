import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionComponent } from '../section/section.component';
import { PropertyRowComponent } from '../property-row/property-row.component';
import { ColorRowComponent } from '../color-row/color-row.component';
import { ActionRowComponent } from '../action-row/action-row.component';
import { CanvasStore } from '../../services/canvas.store';
import { isVector } from '../canvas/canvas.component';
import { Observable, combineLatest } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Shape, ShapeStyle, GroupShape, PrimitiveShape, VectorShape } from '../../models/shape.model';

@Component({
    selector: 'app-right-sidebar',
    standalone: true,
    imports: [
        CommonModule,
        SectionComponent,
        PropertyRowComponent,
        ColorRowComponent,
        ActionRowComponent
    ],
    templateUrl: './right-sidebar.component.html',
    styleUrls: ['./right-sidebar.component.scss']
})
export class RightSidebarComponent {
    shapes$!: Observable<Shape[]>;
    selectedIds$!: Observable<Set<number>>;
    activeStyle$!: Observable<ShapeStyle>;
    singleShape$!: Observable<Shape | null>;
    singleStyle$!: Observable<ShapeStyle>;

    // для экспорта
    @ViewChild('exportCanvasContainer', { static: true, read: ElementRef })
    exportContainer!: ElementRef; // не обязательно, можно найти canvas через querySelector

    // поля для position
    canvasX$!: Observable<number>;
    canvasY$!: Observable<number>;
    canvasW$!: Observable<number>;
    canvasH$!: Observable<number>;

    // радиус для rect
    radius$!: Observable<number>;

    style$!: Observable<ShapeStyle>;

    constructor(public store: CanvasStore) {
        this.shapes$ = this.store.shapes$;
        this.selectedIds$ = this.store.selectedIds$;
        this.activeStyle$ = this.store.activeStyle$;
        this.style$ = this.activeStyle$;

        this.singleShape$ = combineLatest([this.store.shapes$, this.store.selectedIds$]).pipe(
            map(([shapes, sel]) => {
                if (sel.size === 1) {
                    const id = [...sel][0];
                    return shapes.find(s => s.id === id) || null;
                }
                return null;
            })
        );

        this.canvasX$ = this.singleShape$.pipe(
            map(s => (s && 'x' in s ? (s as any).x : 0))
        );
        this.canvasY$ = this.singleShape$.pipe(
            map(s => (s && 'y' in s ? (s as any).y : 0))
        );
        this.canvasW$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (isVector(s)) {
                    const b = this.getBounds(s);
                    return b.right - b.left;
                }
                if ('w' in s) return (s as any).w;
                if ('rx' in s) return (s as any).rx * 2;
                return 0;
            })
        );
        this.canvasH$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (isVector(s)) {
                    const b = this.getBounds(s);
                    return b.bottom - b.top;
                }
                if ('h' in s) return (s as any).h;
                if ('ry' in s) return (s as any).ry * 2;
                return 0;
            })
        );

        this.radius$ = this.activeStyle$.pipe(
            map(st => st.radius ?? 0)
        );
    }

    // геттеры для кнопок
    get canGroup(): boolean {
        return this.store.selectedIds$.value.size >= 2;
    }
    get canUngroup(): boolean {
        return Array.from(this.store.selectedIds$.value).some(id =>
            this.store.shapes$.value.find(s => s.id === id)?.type === 'group'
        );
    }
    get canMerge(): boolean {
        return false; //this.store.selectedIds$.value.size >= 2;
    }
    get canReorder(): boolean {
        return this.store.selectedIds$.value.size > 0;
    }

    // геттеры для групп
    getGroupX(shape: Shape): number {
        if (shape.type === 'group') {
            const g = shape as GroupShape;
            const xs = g.children.map(c => 'x' in c ? (c as any).x : 0);
            return Math.min(...xs);
        }

        return 0;
    }

    getGroupY(shape: Shape): number {
        if (shape.type === 'group') {
            const g = shape as GroupShape;
            const ys = g.children.map(c => 'y' in c ? (c as any).y : 0);
            return Math.min(...ys);
        }

        return 0;
    }

    getGroupW(shape: Shape): number {
        if (shape.type === 'group') {
            const g = shape as GroupShape;
            const xs = g.children.map(c => ('x' in c ? (c as any).x : 0));
            const ws = g.children.map(c =>
                'w' in c ? (c as any).w : 'rx' in c ? (c as any).rx * 2 : 0
            );
            const left = Math.min(...xs);
            const right = Math.max(...xs.map((x, i) => x + ws[i]));
            return right - left;
        }

        return 0;
    }

    /** Вычислить высоту фигуры или группы */
    getGroupH(shape: Shape): number {
        if (shape.type === 'group') {
            const g = shape as GroupShape;
            const ys = g.children.map(c => ('y' in c ? (c as any).y : 0));
            const hs = g.children.map(c =>
                'h' in c ? (c as any).h : 'ry' in c ? (c as any).ry * 2 : 0
            );
            const top = Math.min(...ys);
            const bottom = Math.max(...ys.map((y, i) => y + hs[i]));
            return bottom - top;
        }

        return 0;
    }

    // обработчики изменений
    onPositionChange(prop: 'x' | 'y' | 'w' | 'h', val: number) {
        this.store.updateShapes(arr => {
            const sel = this.store.selectedIds$.value;
            arr.forEach(s => {
                if (!sel.has(s.id)) return;

                if (s.type === 'group') {
                    const g = s as GroupShape;
                    // пересчитать bounding box и дельту
                    const coords = g.children.map(c => ('x' in c ? (c as any).x : 0));
                    const dims = g.children.map(c =>
                        prop === 'w'
                            ? ('w' in c ? (c as any).w : (c as any).rx * 2)
                            : ('h' in c ? (c as any).h : (c as any).ry * 2)
                    );
                    const leading = prop === 'x' ? Math.min(...coords) : Math.min(...coords);
                    if (prop === 'x' || prop === 'y') {
                        const coords = (s as GroupShape).children
                            .map(child => (child as any)[prop] as number);
                        const currentMin = Math.min(...coords);

                        // вычисляем дельту, на сколько сместить, чтобы newMin = val
                        const delta = val - currentMin;

                        // сдвигаем всех детей
                        (s as GroupShape).children.forEach(child => {
                            (child as any)[prop] = ((child as any)[prop] as number) + delta;
                        });
                    } else {
                        // размер: масштабируем группу
                        const currentSize = prop === 'w'
                            ? this.getGroupW(s)
                            : this.getGroupH(s);
                        const scale = val / (currentSize || 1);
                        const offset = prop === 'w'
                            ? Math.min(...coords)
                            : Math.min(...coords);
                        g.children.forEach(c => {
                            // положение
                            (c as any)[prop === 'w' ? 'x' : 'y'] =
                                offset +
                                (((c as any)[prop === 'w' ? 'x' : 'y'] as number) - offset) * scale;
                            // размер
                            if (prop === 'w') {
                                if ('w' in c) (c as any).w *= scale;
                                if ('rx' in c) (c as any).rx *= scale;
                            } else {
                                if ('h' in c) (c as any).h *= scale;
                                if ('ry' in c) (c as any).ry *= scale;
                            }
                        });
                    }
                }

                else if (isVector(s)) {
                    if (prop === 'x' || prop === 'y') {
                        s[prop] = val;
                    } else if (prop === 'w' || prop === 'h') {
                        // сначала вычисляем bbox без масштабирования
                        const svgNS = 'http://www.w3.org/2000/svg';
                        const tmp = document.createElementNS(svgNS, 'path');
                        tmp.setAttribute('d', s.path);
                        const box = tmp.getBBox();
                        const rawW = box.width;
                        const rawH = box.height;

                        if (prop === 'w') {
                            s.scaleX = val / rawW;
                        } else {
                            s.scaleY = val / rawH;
                        }
                        return;
                    }
                    return;
                }

                else if (prop === 'x' || prop === 'y') {
                    (s as any)[prop] = val;
                } else if (s.type === 'rect' || s.type === 'image') {
                    (s as any)[prop] = val;
                } else if (s.type === 'ellipse') {
                    if (prop === 'w') (s as any).rx = val / 2;
                    else if (prop === 'h') (s as any).ry = val / 2;
                }
            });
        });
    }

    onStyleChange(patch: Partial<ShapeStyle>) {
        this.store.updateStyle(patch);
    }

    onShadow(
        key: 'offsetX' | 'offsetY' | 'blur' | 'color',
        val: number | string
    ) {
        this.singleShape$
            .pipe(take(1))
            .subscribe(shape => {
                if (!shape) return;
                // берём текущую тень фигуры (или дефолт, если вдруг undefined)
                const curShadow = shape.style?.shadow ?? this.store.activeStyle$.value.shadow!;
                const updatedShadow = { ...curShadow, [key]: val };
                this.store.updateShapes(arr => {
                    const s = arr.find(sh => sh.id === shape.id);
                    if (s) {
                        s.style!.shadow = updatedShadow;
                    }
                });
            });
    }

    // дублируем логику из CanvasComponent::getBounds
    private getBounds(s: Shape): { left: number, top: number, right: number, bottom: number } {
        if ((s as GroupShape).type === 'group') {
            const arr = (s as GroupShape).children.map(c => this.getBounds(c));
            return {
                left: Math.min(...arr.map(b => b.left)),
                top: Math.min(...arr.map(b => b.top)),
                right: Math.max(...arr.map(b => b.right)),
                bottom: Math.max(...arr.map(b => b.bottom)),
            };
        }

        if (isVector(s)) {
            const v = s as VectorShape;

            const svgNS = 'http://www.w3.org/2000/svg';
            const tmpSvg = document.createElementNS(svgNS, 'svg');
            const pathEl = document.createElementNS(svgNS, 'path');
            pathEl.setAttribute('d', v.path);
            tmpSvg.appendChild(pathEl);
            document.body.appendChild(tmpSvg);

            const box = pathEl.getBBox();

            document.body.removeChild(tmpSvg);

            const scaledX = box.x * v.scaleX + v.x;
            const scaledY = box.y * v.scaleY + v.y;
            const scaledW = box.width * v.scaleX;
            const scaledH = box.height * v.scaleY;

            return {
                left: scaledX,
                top: scaledY,
                right: scaledX + scaledW,
                bottom: scaledY + scaledH,
            };
        }

        const sh = s as PrimitiveShape;
        // базовые границы фигуры
        let left: number, top: number, right: number, bottom: number;
        switch (sh.type) {
            case 'rect':
                left = sh.x;
                top = sh.y;
                right = sh.x + sh.w;
                bottom = sh.y + sh.h;
                break;
            case 'ellipse':
                left = sh.x;
                top = sh.y;
                right = sh.x + sh.rx * 2;
                bottom = sh.y + sh.ry * 2;
                break;
            case 'image':
                left = sh.x;
                top = sh.y;
                right = sh.x + sh.w;
                bottom = sh.y + sh.h;
                break;
            case 'line':
                left = Math.min(sh.x1, sh.x2);
                top = Math.min(sh.y1, sh.y2);
                right = Math.max(sh.x1, sh.x2);
                bottom = Math.max(sh.y1, sh.y2);
                break;
            case 'pen':
                left = Math.min(...sh.points.map(p => p.x));
                top = Math.min(...sh.points.map(p => p.y));
                right = Math.max(...sh.points.map(p => p.x));
                bottom = Math.max(...sh.points.map(p => p.y));
                break;
            case 'text':
            case 'comment':
                const w = 0;//this.ctx.measureText(sh.text).width;
                left = sh.x;
                top = sh.y - 16;
                right = sh.x + w;
                bottom = sh.y;
                break;
        }

        // учитываем strokeWidth
        const strokeW = (sh.style?.lineWidth ?? 0) / 2;
        left -= strokeW;
        top -= strokeW;
        right += strokeW;
        bottom += strokeW;

        // учитываем тень
        if (sh.style?.shadow) {
            const { offsetX, offsetY, blur } = sh.style.shadow;
            // тень расходится на blur в каждую сторону вокруг смещения
            const expandX = blur + Math.abs(offsetX);
            const expandY = blur + Math.abs(offsetY);
            left = Math.min(left, left + offsetX - expandX);
            top = Math.min(top, top + offsetY - expandY);
            right = Math.max(right, right + offsetX + expandX);
            bottom = Math.max(bottom, bottom + offsetY + expandY);
        }

        return { left, top, right, bottom };
    }

    /** экспорт холста в указанный формат */
    exportAs(format: 'png' | 'jpg' | 'svg'): void {
        // cохраняем текущее выделение
        const savedSel = new Set(this.store.selectedIds$.value);

        // прячем bounding-boxes/hover и скрываем комментарии
        this.store.selectedIds$.next(new Set());
        this.store.hideComments$.next(true);

        // подождать, чтобы CanvasComponent успел перерисовать без рамок
        setTimeout(() => {
            // находим оригинальный canvas
            const orig = document.querySelector('app-canvas canvas') as HTMLCanvasElement;
            if (!orig) {
                // восстанавливаем выделение, если канвас не найден
                this.store.hideComments$.next(false);
                this.store.selectedIds$.next(savedSel);
                return;
            }

            // есть ли выделение
            const hasSelection = savedSel.size > 0;

            let targetCanvas: HTMLCanvasElement;

            if (!hasSelection) {
                // экспорт всего холста
                targetCanvas = orig;
            } else {
                // экспорт только выделенной области
                const shapes = this.store.shapes$.value
                    .filter(s => savedSel.has(s.id) && s.type !== 'comment');
                if (shapes.length === 0) {
                    targetCanvas = orig;
                } else {
                const bboxes = shapes.map(s => this.getBounds(s));
                const union = bboxes.reduce((u, b) => ({
                    left:   Math.min(u.left,   b.left),
                    top:    Math.min(u.top,    b.top),
                    right:  Math.max(u.right,  b.right),
                    bottom: Math.max(u.bottom, b.bottom),
                }), bboxes[0]);

                const sw = union.right - union.left;
                const sh = union.bottom - union.top;

                // создаём offscreen canvas
                targetCanvas = document.createElement('canvas');
                targetCanvas.width = sw;
                targetCanvas.height = sh;
                const ctx = targetCanvas.getContext('2d')!;
                ctx.drawImage(
                    orig,
                    union.left, union.top, sw, sh,
                    0, 0, sw, sh
                );
                }
            }

            // экспортируем из targetCanvas
            if (format === 'svg') {
                const pngData = targetCanvas.toDataURL('image/png');
                const svg = `
                    <svg xmlns="http://www.w3.org/2000/svg"
                        width="${targetCanvas.width}" height="${targetCanvas.height}">
                        <image href="${pngData}" width="${targetCanvas.width}"
                            height="${targetCanvas.height}" />
                    </svg>`;
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                this.downloadBlob(blob, `vec-exp-${Date.now()}.svg`);
            } else {
                const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
                targetCanvas.toBlob(blob => {
                    if (blob) this.downloadBlob(blob, `vec-exp-${Date.now()}.${format}`);
                }, mime);
            }

            // восстанавливаем выделение и комментарии
            this.store.hideComments$.next(false);
            this.store.selectedIds$.next(savedSel);
        }, 50);
    }

    private downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
