/*  src/app/components/canvas/canvas.component.ts
 *  «сердце» редактора: рисование, выделение, перетаскивание
 *  и отрисовка Canvas‑сцены.  Работает вместе с CanvasStore.
 */
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { Tool } from '../../models/tool.enum';
import {
  Shape,
  PrimitiveShape,
  GroupShape,
  Point,
  ImageShape,
  ShapeStyle,
} from '../../models/shape.model';
import { CanvasStore } from '../../services/canvas.store';

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  /* ——— входящий активный инструмент ——— */
  @Input() tool: Tool = Tool.Pen;

  /* ——— ссылка на <canvas> ——— */
  @ViewChild('canvas', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>;

  /* ——— приватные состояния ——— */
  private ctx!: CanvasRenderingContext2D;
  private sub!: Subscription; // подписка на поток фигур

  private drawing = false; // сейчас рисуем?
  private startPoint!: Point; // первая точка drag‑а
  private movingShape: Shape | null = null; // перетаскиваемая фигура
  private moveOffset: Point = { x: 0, y: 0 };

  /* ——— удобный геттер для массива фигур из стора ——— */
  private get shapes(): Shape[] {
    return this.store.shapes$.value;
  }

  private readonly HANDLE = 8;
  private activeHandle: 'nw' | 'ne' | 'se' | 'sw' | null = null;
  private resizeOrigin: Point | null = null;
  private initialShapeCopy: Shape | null = null;

  constructor(private store: CanvasStore) {}

  /* ─────────────────────────────────────────── */
  /* life‑cycle                                 */
  /* ─────────────────────────────────────────── */
  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    /* при любом изменении массива фигур – перерисовываем сцену */
    this.sub = this.store.shapes$.subscribe(() => this.redraw());

    /* стартовая очистка */
    this.redraw();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Удаляет все выбранные фигуры */
  deleteSelected(): void {
    const sel = this.store.selectedIds$.value; // Set<number>
    if (!sel.size) return;

    /* 1. убираем фигуры из массива */
    const left = this.store.shapes$.value.filter((sh) => !sel.has(sh.id));
    this.store.shapes$.next(left);

    /* 2. очищаем выделение */
    this.store.selectedIds$.next(new Set<number>());

    /* 3. перерисовываем полотно */
    this.redraw();
  }

  /* ─────────────────────────────────────────── */
  /* mouse events                               */
  /* ─────────────────────────────────────────── */
  mousedown(e: MouseEvent): void {
    const pos = this.pointer(e);
    /* ---- если клик попал на ручку ---- */
    const h = this.handleAtPoint(pos);
    if (h) {
      this.activeHandle = h;
      this.resizeOrigin = pos;
      const id = [...this.store.selectedIds$.value][0];
      this.initialShapeCopy = structuredClone(
        this.shapes.find((s) => s.id === id) as Shape
      );
      return; // клик именно по ручке – дальше не идём
    }
    this.startPoint = pos;

    switch (this.tool) {
      /* === 1. MOVE (select / drag) =============== */
      case Tool.Move: {
        const target = this.findShape(pos);
        if (target) {
          e.shiftKey
            ? this.store.toggle(target.id)
            : this.store.select(target.id);
          this.movingShape = target;
          this.moveOffset = {
            x: pos.x - this.getShapeLeft(target),
            y: pos.y - this.getShapeTop(target),
          };
        } else {
          this.store.clearSelection();
        }
        break;
      }

      /* === 2. свободный контур =================== */
      case Tool.Pen: {
        this.drawing = true;
        const pen: PrimitiveShape = {
          id: Date.now(),
          type: 'pen',
          points: [pos],
          style: { ...this.store.activeStyle$.value },
        };
        this.store.updateShapes((arr) => arr.push(pen));
        break;
      }

      /* === 3. фигуры, создаваемые drag‑ом ========= */
      case Tool.Rect:
      case Tool.Line:
      case Tool.Ellipse: {
        this.drawing = true;
        const shape = this.initialShapeForDrag(pos);
        this.store.updateShapes((arr) => arr.push(shape));
        break;
      }

      /* === 4. однократные (Text/Comment) ========= */
      case Tool.Text:
      case Tool.Comment: {
        const label =
          this.tool === Tool.Text ? 'Введите текст:' : 'Комментарий:';
        const txt = prompt(label);
        if (!txt) return;

        const shape: PrimitiveShape = {
          id: Date.now(),
          type: this.tool === Tool.Text ? 'text' : 'comment',
          x: pos.x,
          y: pos.y,
          text: txt,
          style: { stroke: '#000', fill: '#000', lineWidth: 1 },
        } as any;

        this.store.updateShapes((arr) => arr.push(shape));
        break;
      }
    }
  }

  mousemove(e: MouseEvent): void {
    const pos = this.pointer(e);
    /* === процесс изменения размера === */
    if (this.activeHandle && this.resizeOrigin) {
      const id = [...this.store.selectedIds$.value][0];
      const shp = this.shapes.find((s) => s.id === id);
      if (shp) {
        this.updateResizedShape(shp, pos);
        this.redraw();
      }
      return; // мышь двигает ручку – дальше код перемещения не нужен
    }

    /* — перетаскивание выбранной фигуры — */
    if (this.tool === Tool.Move && this.movingShape) {
      this.store.updateShapes((arr) => {
        const s = arr.find((sh) => sh.id === this.movingShape!.id);
        if (s)
          this.translateShape(
            s,
            pos.x - this.moveOffset.x,
            pos.y - this.moveOffset.y
          );
      });
      return;
    }

    /* — свободное рисование (pen) — */
    if (this.tool === Tool.Pen && this.drawing) {
      this.store.updateShapes((arr) => {
        const pen = arr[arr.length - 1] as PrimitiveShape & { type: 'pen' };
        pen.points.push(pos);
      });
      return;
    }

    /* — тянем прямоугольник / линию / эллипс — */
    if (
      this.drawing &&
      (this.tool === Tool.Rect ||
        this.tool === Tool.Line ||
        this.tool === Tool.Ellipse)
    ) {
      this.store.updateShapes((arr) => {
        const shape = arr[arr.length - 1];
        this.updateDraggedShape(shape as PrimitiveShape, pos);
      });
    }
  }

  mouseup(): void {
    this.drawing = false;
    this.movingShape = null;
    this.activeHandle = null;
    this.resizeOrigin = null;
    this.initialShapeCopy = null;
  }
  mouseleave(): void {
    this.mouseup();
  }

  /* ─────────────────────────────────────────── */
  /* rendering                                   */
  /* ─────────────────────────────────────────── */
  private redraw(): void {
    const cvs = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, cvs.width, cvs.height);

    for (const s of this.shapes) this.drawShape(s);
    /* ─ рамка выбора ─ */
    const ids = [...this.store.selectedIds$.value];
    if (ids.length === 1) {
      const shp = this.shapes.find((s) => s.id === ids[0]);
      if (shp) this.drawBoundingBox(shp);
    }
  }

  private drawShape(shape: Shape): void {
    if ((shape as GroupShape).type === 'group') {
      (shape as GroupShape).children.forEach((c) => this.drawShape(c));
      return;
    }
    const s = shape as PrimitiveShape;

    const st: ShapeStyle = {
      stroke: '#000',
      fill: 'transparent',
      lineWidth: 2,
      ...(s.style ?? {}),
    };

    /* — применяем stroke‑параметры — */
    this.ctx.lineWidth = st.lineWidth ?? 2;
    this.ctx.strokeStyle = st.stroke ?? '#000';
    this.ctx.fillStyle = st.fill ?? 'transparent';

    /* shadow */
    if (st.shadow) {
      this.ctx.shadowOffsetX = st.shadow.offsetX;
      this.ctx.shadowOffsetY = st.shadow.offsetY;
      this.ctx.shadowBlur = st.shadow.blur;
      this.ctx.shadowColor = st.shadow.color;
    } else {
      this.ctx.shadowBlur = this.ctx.shadowOffsetX = this.ctx.shadowOffsetY = 0;
      this.ctx.shadowColor = 'transparent';
    }

    switch (s.type) {
      case 'image': {
        const imgSh = s as ImageShape;

        /* если изображение ещё не загружено – загружаем асинхронно */
        if (!imgSh._img) {
          const im = new Image();
          im.onload = () => {
            imgSh._img = im;
            this.redraw(); // перерисуем, когда готово
          };
          im.src = imgSh.src;
          break; // пока нечего рисовать
        }

        this.ctx.drawImage(
          imgSh._img as HTMLImageElement,
          imgSh.x,
          imgSh.y,
          imgSh.w,
          imgSh.h
        );
        break;
      }
      case 'pen': {
        this.ctx.beginPath();
        s.points.forEach((p, i) =>
          i ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y)
        );
        this.ctx.stroke();
        break;
      }
      case 'line': {
        this.ctx.beginPath();
        this.ctx.moveTo(s.x1, s.y1);
        this.ctx.lineTo(s.x2, s.y2);
        this.ctx.stroke();
        break;
      }
      case 'rect': {
        const r = st.radius ?? 0;
        if (r) {
          /* скруглённый rect */
          this.roundRectPath(s.x, s.y, s.w, s.h, r);
          this.ctx.fill();
          this.ctx.shadowColor = 'transparent';
          this.ctx.stroke();
        } else {
          this.ctx.fillRect(s.x, s.y, s.w, s.h);
          this.ctx.shadowColor = 'transparent';
          this.ctx.strokeRect(s.x, s.y, s.w, s.h);
        }
        break;
      }
      case 'ellipse': {
        this.ctx.beginPath();
        this.ctx.ellipse(
          s.x + s.rx,
          s.y + s.ry,
          Math.abs(s.rx),
          Math.abs(s.ry),
          0,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
        this.ctx.shadowColor = 'transparent';
        this.ctx.stroke();
        break;
      }
      case 'text':
      case 'comment': {
        this.ctx.fillText(s.text, s.x, s.y);
        if (s.type === 'comment') {
          const w = this.ctx.measureText(s.text).width;
          this.ctx.strokeRect(s.x - 4, s.y - 16, w + 8, 20);
        }
        break;
      }
    }
  }

  /* ─────────────────────────────────────────── */
  /* helpers                                    */
  /* ─────────────────────────────────────────── */
  private pointer(e: MouseEvent): Point {
    const r = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private initialShapeForDrag(p: Point): PrimitiveShape {
    const common = {
      id: Date.now(),
      style: { ...this.store.activeStyle$.value },
    };
    switch (this.tool) {
      case Tool.Rect:
        return { ...common, type: 'rect', x: p.x, y: p.y, w: 0, h: 0 };
      case Tool.Line:
        return { ...common, type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      case Tool.Ellipse:
        return { ...common, type: 'ellipse', x: p.x, y: p.y, rx: 0, ry: 0 };
      default:
        throw new Error('unexpected tool');
    }
  }

  private updateDraggedShape(shape: PrimitiveShape, p: Point): void {
    switch (shape.type) {
      case 'rect':
        shape.w = p.x - shape.x;
        shape.h = p.y - shape.y;
        break;
      case 'line':
        shape.x2 = p.x;
        shape.y2 = p.y;
        break;
      case 'ellipse':
        shape.rx = (p.x - shape.x) / 2;
        shape.ry = (p.y - shape.y) / 2;
        break;
    }
  }

  /* — поиск фигуры для выбора — */
  private findShape(p: Point): Shape | null {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (this.pointInsideShape(p, s)) return s;
    }
    return null;
  }

  private pointInsideShape(p: Point, s: Shape): boolean {
    if ((s as GroupShape).type === 'group')
      return (s as GroupShape).children.some((c) =>
        this.pointInsideShape(p, c)
      );

    const sh = s as PrimitiveShape;
    switch (sh.type) {
      case 'image':
        return (
          p.x >= sh.x && p.x <= sh.x + sh.w && p.y >= sh.y && p.y <= sh.y + sh.h
        );
      case 'rect':
        return (
          p.x >= sh.x && p.x <= sh.x + sh.w && p.y >= sh.y && p.y <= sh.y + sh.h
        );
      case 'ellipse': {
        const cx = sh.x + sh.rx,
          cy = sh.y + sh.ry;
        const dx = p.x - cx,
          dy = p.y - cy;
        return (dx * dx) / (sh.rx * sh.rx) + (dy * dy) / (sh.ry * sh.ry) <= 1;
      }
      case 'line':
        return (
          this.pointToSegmentDistance(
            p,
            { x: sh.x1, y: sh.y1 },
            { x: sh.x2, y: sh.y2 }
          ) < 5
        );
      case 'pen':
        return sh.points.some((pt) => Math.hypot(p.x - pt.x, p.y - pt.y) < 5);
      case 'text':
      case 'comment': {
        const w = this.ctx.measureText(sh.text).width;
        return (
          p.x >= sh.x && p.x <= sh.x + w && p.y <= sh.y && p.y >= sh.y - 16
        );
      }
    }
  }

  private translateShape(s: Shape, newX: number, newY: number): void {
    if ((s as GroupShape).type === 'group') {
      /* смещение рассчитываем только один раз, иначе  
         после перемещения первого дочернего объекта  
         границы группы меняются и dx становится 0  */
      const groupLeft = this.getShapeLeft(s);
      const groupTop = this.getShapeTop(s);
      const dx = newX - groupLeft;
      const dy = newY - groupTop;

      (s as GroupShape).children.forEach((c) => {
        this.translateShape(
          c,
          this.getShapeLeft(c) + dx,
          this.getShapeTop(c) + dy
        );
      });
      return;
    }

    switch (s.type) {
      case 'image':
      case 'rect':
      case 'ellipse':
      case 'text':
      case 'comment':
        (s as any).x = newX;
        (s as any).y = newY;
        break;
      case 'line': {
        const dx = newX - this.getShapeLeft(s);
        const dy = newY - this.getShapeTop(s);
        s.x1 += dx;
        s.y1 += dy;
        s.x2 += dx;
        s.y2 += dy;
        break;
      }
      case 'pen': {
        const dx = newX - this.getShapeLeft(s);
        const dy = newY - this.getShapeTop(s);
        s.points.forEach((pt) => {
          pt.x += dx;
          pt.y += dy;
        });
        break;
      }
    }
  }

  private getBounds(s: Shape): Bounds {
    if ((s as GroupShape).type === 'group') {
      const arr = (s as GroupShape).children.map((c) => this.getBounds(c));
      return {
        left: Math.min(...arr.map((b) => b.left)),
        top: Math.min(...arr.map((b) => b.top)),
        right: Math.max(...arr.map((b) => b.right)),
        bottom: Math.max(...arr.map((b) => b.bottom)),
      };
    }
    const sh = s as PrimitiveShape;
    switch (sh.type) {
      case 'rect':
        return {
          left: sh.x,
          top: sh.y,
          right: sh.x + sh.w,
          bottom: sh.y + sh.h,
        };
      case 'ellipse':
        return {
          left: sh.x,
          top: sh.y,
          right: sh.x + sh.rx * 2,
          bottom: sh.y + sh.ry * 2,
        };
      case 'image':
        return {
          left: sh.x,
          top: sh.y,
          right: sh.x + sh.w,
          bottom: sh.y + sh.h,
        };
      case 'line':
        return {
          left: Math.min(sh.x1, sh.x2),
          top: Math.min(sh.y1, sh.y2),
          right: Math.max(sh.x1, sh.x2),
          bottom: Math.max(sh.y1, sh.y2),
        };
      case 'pen':
        return {
          left: Math.min(...sh.points.map((p) => p.x)),
          top: Math.min(...sh.points.map((p) => p.y)),
          right: Math.max(...sh.points.map((p) => p.x)),
          bottom: Math.max(...sh.points.map((p) => p.y)),
        };
      case 'text':
      case 'comment': {
        const w = this.ctx.measureText(sh.text).width;
        return { left: sh.x, top: sh.y - 16, right: sh.x + w, bottom: sh.y };
      }
    }
  }

  /* ---------- drawing selection ---------- */
  private drawBoundingBox(s: Shape): void {
    const b = this.getBounds(s);
    this.ctx.save();
    this.ctx.strokeStyle = '#3498db';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 2]);
    this.ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    this.ctx.setLineDash([]);

    /* ручки */
    const hs = this.HANDLE;
    const half = hs / 2;
    const pts = [
      { x: b.left, y: b.top, tag: 'nw' },
      { x: b.right, y: b.top, tag: 'ne' },
      { x: b.right, y: b.bottom, tag: 'se' },
      { x: b.left, y: b.bottom, tag: 'sw' },
    ] as const;

    this.ctx.fillStyle = '#fff';
    this.ctx.strokeStyle = '#3498db';
    pts.forEach((pt) => {
      this.ctx.fillRect(pt.x - half, pt.y - half, hs, hs);
      this.ctx.strokeRect(pt.x - half, pt.y - half, hs, hs);
    });
    this.ctx.restore();
  }

  /* ---------- hit-test по ручкам ---------- */
  private handleAtPoint(p: Point): 'nw' | 'ne' | 'se' | 'sw' | null {
    const ids = [...this.store.selectedIds$.value];
    if (ids.length !== 1) return null;
    const shp = this.shapes.find((s) => s.id === ids[0]);
    if (!shp) return null;

    const b = this.getBounds(shp);
    const half = this.HANDLE / 2;
    const tests: { [k: string]: Bounds } = {
      nw: {
        left: b.left - half,
        top: b.top - half,
        right: b.left + half,
        bottom: b.top + half,
      },
      ne: {
        left: b.right - half,
        top: b.top - half,
        right: b.right + half,
        bottom: b.top + half,
      },
      se: {
        left: b.right - half,
        top: b.bottom - half,
        right: b.right + half,
        bottom: b.bottom + half,
      },
      sw: {
        left: b.left - half,
        top: b.bottom - half,
        right: b.left + half,
        bottom: b.bottom + half,
      },
    };
    for (const k of Object.keys(tests) as ('nw' | 'ne' | 'se' | 'sw')[]) {
      const t = tests[k];
      if (p.x >= t.left && p.x <= t.right && p.y >= t.top && p.y <= t.bottom)
        return k;
    }
    return null;
  }

  /** Изменяем размеры выбранной фигуры, тянув за угловую ручку  */
  private updateResizedShape(s: Shape, p: Point): void {
    /* если нет копии исходной фигуры или ручка не активна — выходим */
    if (!this.initialShapeCopy || !this.activeHandle || !this.resizeOrigin)
      return;

    const orig = this.initialShapeCopy; // «снимок» до начала resize
    const oB = this.getBounds(orig); // исходный bounding-box

    const dx = p.x - this.resizeOrigin.x; // смещение курсора
    const dy = p.y - this.resizeOrigin.y;

    /* для левой/верхней ручек знак отрицательный */
    const signX =
      this.activeHandle === 'ne' || this.activeHandle === 'se' ? 1 : -1;
    const signY =
      this.activeHandle === 'se' || this.activeHandle === 'sw' ? 1 : -1;

    const newW = Math.max(10, oB.right - oB.left + dx * signX); // не даём сжать <10 px
    const newH = Math.max(10, oB.bottom - oB.top + dy * signY);

    /* коэффициенты масштабирования (можно пригодиться для будущих типов) */
    const kx = newW / (oB.right - oB.left);
    const ky = newH / (oB.bottom - oB.top);

    /******************  рекурсивная функция, применяющая изменения  ******************/
    const apply = (target: Shape): void => {
      /* если встретилась вложенная группа — спускаемся внутрь */
      if ((target as GroupShape).type === 'group') {
        (target as GroupShape).children.forEach(apply);
        return;
      }

      const t = target as PrimitiveShape;

      switch (t.type) {
        /* ─────────── прямоугольник ─────────── */
        case 'rect':
          if (signX < 0) t.x = oB.right - newW;
          if (signY < 0) t.y = oB.bottom - newH;
          t.w = newW;
          t.h = newH;
          break;

        /* ─────────── эллипс ─────────── */
        case 'ellipse':
          if (signX < 0) t.x = oB.right - newW;
          if (signY < 0) t.y = oB.bottom - newH;
          t.rx = newW / 2;
          t.ry = newH / 2;
          break;

        /* ─────────── изображение ─────────── */
        case 'image':
          if (signX < 0) t.x = oB.right - newW;
          if (signY < 0) t.y = oB.bottom - newH;
          t.w = newW;
          t.h = newH;
          break;

        /* ─────────── линия ─────────── */
        case 'line':
          if (this.activeHandle === 'nw' || this.activeHandle === 'sw') {
            t.x1 = oB.right - newW;
          } else {
            t.x2 = oB.left + newW;
          }
          if (this.activeHandle === 'nw' || this.activeHandle === 'ne') {
            t.y1 = oB.bottom - newH;
          } else {
            t.y2 = oB.top + newH;
          }
          break;

        case 'pen':
        case 'text':
        case 'comment':
          if (signX < 0) {
            this.translateShape(t, oB.right - newW, this.getShapeTop(t));
          }
          if (signY < 0) {
            this.translateShape(t, this.getShapeLeft(t), oB.bottom - newH);
          }
          break;
      }
    };
    apply(s);
  }

  private getShapeLeft(s: Shape): number {
    if ((s as GroupShape).type === 'group')
      return Math.min(
        ...(s as GroupShape).children.map((c) => this.getShapeLeft(c))
      );

    const sh = s as PrimitiveShape;
    switch (sh.type) {
      case 'image':
        return sh.x;
      case 'rect':
        return sh.x;
      case 'ellipse':
        return sh.x;
      case 'line':
        return Math.min(sh.x1, sh.x2);
      case 'pen':
        return Math.min(...sh.points.map((p) => p.x));
      case 'text':
      case 'comment':
        return sh.x;
    }
  }
  private getShapeTop(s: Shape): number {
    if ((s as GroupShape).type === 'group')
      return Math.min(
        ...(s as GroupShape).children.map((c) => this.getShapeTop(c))
      );

    const sh = s as PrimitiveShape;
    switch (sh.type) {
      case 'image':
        return sh.y;
      case 'rect':
        return sh.y;
      case 'ellipse':
        return sh.y;
      case 'line':
        return Math.min(sh.y1, sh.y2);
      case 'pen':
        return Math.min(...sh.points.map((p) => p.y));
      case 'text':
      case 'comment':
        return sh.y - 16;
    }
  }

  /* расстояние от точки до сегмента AB */
  private pointToSegmentDistance(p: Point, A: Point, B: Point): number {
    const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - A.x, p.y - A.y);
    let t = ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  /* ─────────────────────────────────────────── */
  /* responsive resize                           */
  /* ─────────────────────────────────────────── */
  @HostListener('window:resize')
  onResize(): void {
    const cvs = this.canvasRef.nativeElement;
    const temp = document.createElement('canvas');
    temp.width = cvs.width;
    temp.height = cvs.height;
    temp.getContext('2d')?.drawImage(cvs, 0, 0);

    cvs.width = cvs.offsetWidth;
    cvs.height = cvs.offsetHeight;

    this.ctx = cvs.getContext('2d')!;
    this.ctx.drawImage(temp, 0, 0);
    this.redraw();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent): void {
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
      this.deleteSelected();
      e.preventDefault(); // чтобы Backspace не «уходил» назад в браузере
    }
  }
}
