import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Shape } from '../../models/shape.model';
import { SectionComponent } from '../section/section.component';
import { LayerRowComponent } from '../layer-row/layer-row.component';
import { CanvasStore } from '../../services/canvas.store';
import { map } from 'rxjs/operators';

@Component({
    selector: 'app-left-sidebar',
    standalone: true,
    imports: [
        CommonModule,
        SectionComponent,
        LayerRowComponent
    ],
    templateUrl: './left-sidebar.component.html',
    styleUrls: ['./left-sidebar.component.scss']
})
export class LeftSidebarComponent {
    shapes$!: Observable<Shape[]>;
    shapesReversed$!: Observable<Shape[]>;
    selectedIds$!: Observable<Set<number>>;
    defaultNames: Record<number, string> = {};
    layerNames: Record<number, string> = {};
    private counts: Record<string, number> = {};

    constructor(public store: CanvasStore) {
        this.shapes$ = this.store.shapes$;
        this.selectedIds$ = this.store.selectedIds$;

        // подрядок слоев сверху-вниз для отображения в списке
        this.shapesReversed$ = store.shapes$.pipe(
            map(arr => arr.slice().reverse())
        );

        // подписка один раз на появление новых слоёв
        this.store.shapes$.subscribe(arr => {
            arr.forEach(s => {
                // присваиваем defaultNames только один раз на каждый id
                if (!this.defaultNames[s.id]) {
                    const base = s.type.charAt(0).toUpperCase() + s.type.slice(1);
                    this.counts[base] = (this.counts[base] || 0) + 1;
                    this.defaultNames[s.id] =
                        this.counts[base] > 1 ? `${base} ${this.counts[base]}` : base;
                }
            });
        });
    }

    selectShape(id: number) {
        this.store.select(id);
    }

    getSelectedShape(): Shape | undefined {
        const sel = Array.from(this.store.selectedIds$.value)[0];
        return this.store.shapes$.value.find(s => s.id === sel);
    }

    // temp
    onColorChange(newColor: string) {
        this.store.updateStyle({ fill: newColor });
    }

    onLayerClick(id: number, e: MouseEvent) {
        if (e.shiftKey) this.rangeSelect(id);
        else if (e.ctrlKey || e.metaKey) this.store.toggle(id);
        else this.store.select(id);
    }

    private rangeSelect(id: number) {
        const all = this.store.shapes$.value;
        const selArr = Array.from(this.store.selectedIds$.value);
        const last = selArr.length ? selArr[selArr.length - 1] : all[0].id;
        const idx1 = all.findIndex(s => s.id === last);
        const idx2 = all.findIndex(s => s.id === id);
        const [start, end] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
        const rangeIds = all.slice(start, end + 1).map(s => s.id);
        this.store.selectedIds$.next(new Set(rangeIds));
    }

    onLayerRename(id: number, newName: string) {
        this.layerNames[id] = newName.trim();
    }
}
