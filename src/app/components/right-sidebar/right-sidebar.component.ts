import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionComponent } from '../section/section.component';
import { PropertyRowComponent } from '../property-row/property-row.component';
import { ColorRowComponent } from '../color-row/color-row.component';
import { ActionRowComponent } from '../action-row/action-row.component';
import { CanvasStore } from '../../services/canvas.store';
import { Observable, combineLatest } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Shape, PrimitiveShape, ShapeStyle, GroupShape } from '../../models/shape.model';

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

  // поля для position
  canvasX$!: Observable<number>;
  canvasY$!: Observable<number>;
  canvasW$!: Observable<number>;
  canvasH$!: Observable<number>;

  // радиус для rect
  radius$!: Observable<number>;

  style$!: Observable<ShapeStyle>;

  constructor(public store: CanvasStore) {
    this.shapes$      = this.store.shapes$;
    this.selectedIds$ = this.store.selectedIds$;
    this.activeStyle$ = this.store.activeStyle$;
    this.style$       = this.activeStyle$;

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
        if ('w' in s) return (s as any).w;
        if ('rx' in s) return (s as any).rx * 2;
        return 0;
      })
    );
    this.canvasH$ = this.singleShape$.pipe(
      map(s => {
        if (!s) return 0;
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

        else if (prop === 'x' || prop === 'y') {
          (s as any)[prop] = val;
        } else if (s.type === 'rect' || s.type === 'image') {
          (s as any)[prop] = val;
        } else if (s.type === 'ellipse') {
          if (prop === 'w') (s as any).rx = val / 2;
          if (prop === 'h') (s as any).ry = val / 2;
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
        // Берём текущую тень фигуры (или дефолт, если вдруг undefined)
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
}
