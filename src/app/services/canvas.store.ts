import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Shape, ShapeStyle } from '../models/shape.model';
import { Tool } from '../models/tool.enum';

@Injectable({ providedIn: 'root' })
export class CanvasStore {
    /* ────────── состояние холста ────────── */
    readonly shapes$ = new BehaviorSubject<Shape[]>([]);
    readonly selectedIds$ = new BehaviorSubject<Set<number>>(new Set());

    /* стиль, который получит КАЖДАЯ новая фигура,  
       если на холсте сейчас ничего не выделено        */
    readonly activeStyle$ = new BehaviorSubject<ShapeStyle>({
        stroke: '#000000',
        fill: '#d9d9d9',
        lineWidth: 2,
        fillEnabled: true,
        strokeEnabled: false,
        alpha: 1,
        shadow: { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' }
    });

    /* выбранный инструмент (нужен сайдбару, чтобы  
       показать/скрыть релевантные опции)              */
    readonly activeTool$ = new BehaviorSubject<Tool>(Tool.Move);

    /* ────────── helpers ────────── */
    updateShapes(mutator: (arr: Shape[]) => void): void {
        const copy = [...this.shapes$.value];
        mutator(copy);
        this.shapes$.next(copy);
    }

    setActiveTool(t: Tool): void {
        this.activeTool$.next(t);
    }

    /* ────────── selection ────────── */
    clearSelection(): void {
        this.selectedIds$.next(new Set());
    }
    select(id: number): void {
        this.selectedIds$.next(new Set([id]));
    }
    toggle(id: number): void {
        const s = new Set(this.selectedIds$.value);
        s.has(id) ? s.delete(id) : s.add(id);
        this.selectedIds$.next(s);
    }

    /* ────────── style patch ──────────  
       Если что-то выделено – меняем стиль выделенных фигур.  
       Если нет – запоминаем как «активный» стиль, который  
       будут наследовать все новые фигуры.                 */
    updateStyle(patch: Partial<ShapeStyle>): void {
        const sel = this.selectedIds$.value;

        if (sel.size) {
            const updated: Shape[] = this.shapes$.value.map((sh) =>
                sel.has(sh.id)
                    ? ({ ...sh, style: { ...(sh.style ?? {}), ...patch } } as Shape)
                    : sh
            );
            this.shapes$.next(updated);
        } else {
            this.activeStyle$.next({
                ...this.activeStyle$.value,
                ...patch,
            });
        }
    }

    /* ——— группировка ——— */
    groupSelected() {
        const ids = [...this.selectedIds$.value];
        if (ids.length < 2) return;

        this.updateShapes((arr) => {
            const children = arr.filter((s) => ids.includes(s.id));
            const others = arr.filter((s) => !ids.includes(s.id));
            const group: Shape = {
                id: Date.now(), // простая «уникальность»
                type: 'group',
                children,
                style: { fill: '#d9d9d9' },
            };
            this.selectedIds$.next(new Set([group.id]));
            arr.splice(0, arr.length, ...others, group);
        });
    }

    ungroupSelected() {
        this.updateShapes((arr) => {
            const newArr: Shape[] = [];
            arr.forEach((s) => {
                if (s.type === 'group' && this.selectedIds$.value.has(s.id))
                    newArr.push(...s.children);
                else newArr.push(s);
            });
            this.selectedIds$.next(new Set());
            arr.splice(0, arr.length, ...newArr);
        });
    }

    /* ——— merge только для контуров (pen/line) ——— */
    mergeSelected() {
        const ids = [...this.selectedIds$.value];
        let mergedPts: { x: number; y: number }[] = [];
        this.updateShapes((arr) => {
            const rest: Shape[] = [];
            arr.forEach((s) => {
                if (ids.includes(s.id) && (s.type === 'pen' || s.type === 'line')) {
                    if (s.type === 'pen') mergedPts.push(...s.points);
                    else mergedPts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
                } else rest.push(s);
            });
            if (mergedPts.length) {
                rest.push({
                    id: Date.now(),
                    type: 'pen',
                    points: mergedPts,
                    style: { stroke: '#2c3e50', lineWidth: 2 },
                } as Shape);
                this.selectedIds$.next(new Set());
                arr.splice(0, arr.length, ...rest);
            }
        });
    }

    /* ——— порядок слоёв ——— */
    // bringToFront() {
    //   const ids = this.selectedIds$.value;
    //   this.updateShapes((arr) => {
    //     const picked = arr.filter((s) => ids.has(s.id));
    //     const others = arr.filter((s) => !ids.has(s.id));
    //     arr.splice(0, arr.length, ...others, ...picked);
    //   });
    // }
    // sendToBack() {
    //   const ids = this.selectedIds$.value;
    //   this.updateShapes((arr) => {
    //     const picked = arr.filter((s) => ids.has(s.id));
    //     const others = arr.filter((s) => !ids.has(s.id));
    //     arr.splice(0, arr.length, ...picked, ...others);
    //   });
    // }

    bringToFront() {
        const ids = this.selectedIds$.value;
        this.updateShapes(arr => {
            for (let i = arr.length - 2; i >= 0; i--) {
                if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) {
                    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                }
            }
        });
    }

    sendToBack() {
        const ids = this.selectedIds$.value;
        this.updateShapes(arr => {
            for (let i = 1; i < arr.length; i++) {
                if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) {
                    [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
                }
            }
        });
    }
}
