import { Component, EventEmitter, OnInit, Output } from '@angular/core';  
import { CommonModule } from '@angular/common';  
import { CanvasStore } from '../../services/canvas.store';  
import { Shape } from '../../models/shape.model';
import { combineLatest } from 'rxjs';
import { Tool } from '../../models/tool.enum';

type ShadowKey = 'offsetX' | 'offsetY' | 'blur' | 'color';  

@Component({  
  selector: 'app-settings-sidebar',  
  standalone: true,  
  imports: [CommonModule],  
  templateUrl: './settings-sidebar.component.html',  
  styleUrls: ['./settings-sidebar.component.scss']  
})  
export class SettingsSidebarComponent implements OnInit {  

  /* флаги, определяющие доступные секции */  
  showStroke = true;  
  showFill   = true;  
  showRadius = false;  
  showShadow = true;  

  @Output() delete = new EventEmitter<void>(); 

  constructor(public store: CanvasStore) {}  

  /* ------------------------------------------------ */  
  /*  динамически вычисляем, какие секции показывать  */  
  /* ------------------------------------------------ */  
  ngOnInit(): void {  
    combineLatest([  
      this.store.selectedIds$,  
      this.store.activeTool$  
    ]).subscribe(([sel, tool]) => {  

      // какой «актуальный» тип фигуры?  
      const type = sel.size  
        ? this.store.shapes$.value.find(s => s.id === [...sel][0])?.type  
        : this.toolToShape(tool);  

      this.showStroke = true;                     // stroke есть всегда  
      this.showFill   = type !== 'pen' && type !== 'line';  
      this.showRadius = type === 'rect';  
      this.showShadow = type !== 'pen';  
    });  
  }  

  private toolToShape(t: Tool) {  
    switch (t) {  
      case Tool.Pen:     return 'pen';  
      case Tool.Line:    return 'line';  
      case Tool.Rect:    return 'rect';  
      case Tool.Ellipse: return 'ellipse';  
      case Tool.Text:    return 'text';  
      case Tool.Comment: return 'comment';  
      default:           return null;  
    }  
  }  

  /* ------------- style setters -------------- */  
  onStroke(color: string): void {  
    this.store.updateStyle({ stroke: color });  
  }  
  onFill(color: string): void {  
    this.store.updateStyle({ fill: color });  
  }  
  onWidth(width: number): void {  
    if (width) this.store.updateStyle({ lineWidth: width });  
  }  
  onRadius(r: number): void {  
    this.store.updateStyle({ radius: r });  
  }  

  updateShadow(prop: ShadowKey, value: number | string): void {  
    const current = this.currentShadow();  
    const full = {  
      offsetX: 0, offsetY: 0, blur: 0, color: '#000',  
      ...current, [prop]: value  
    };  
    this.store.updateStyle({ shadow: full });  
  }  

  /* ------------------ delete ----------------- */  
  deleteSelection(){
    this.delete.emit();
  }

  /* ------------- grouping / z-order ---------- */  
  group():   void { this.store.groupSelected();   }  
  ungroup(): void { this.store.ungroupSelected(); }  
  merge():   void { this.store.mergeSelected();   }  
  front():   void { this.store.bringToFront();    }  
  back():    void { this.store.sendToBack();      }  

  /* ------------- helpers -------------------- */  
  private currentShadow() {  
    const id = [...this.store.selectedIds$.value][0];  
    if (!id) return {};  
    const shp = this.store.shapes$.value.find(s => s.id === id);  
    return shp?.style?.shadow ?? {};  
  }  

  /* ---------- EXPORT ---------- */  
exportJSON(): void {  
  const data = JSON.stringify(this.store.shapes$.value, null, 2);  
  const blob = new Blob([data], { type: 'application/json' });  
  const url  = URL.createObjectURL(blob);  
  const a = document.createElement('a');  
  a.href = url;  a.download = 'drawing.json';  a.click();  
  URL.revokeObjectURL(url);  
}  

/* ---------- IMPORT ---------- */  
onImportSelect(evt: Event): void {  
  const file = (evt.target as HTMLInputElement).files?.[0];  
  if (!file) return;  
  const rdr = new FileReader();  
  rdr.onload = () => {  
    try {  
      const arr: Shape[] = JSON.parse(rdr.result as string);  
      this.store.updateShapes(sh => { sh.splice(0, sh.length, ...arr); });  
    } catch { alert('Неверный файл'); }  
  };  
  rdr.readAsText(file);  
}  

/* ---------- INSERT IMAGE ---------- */  
onImageSelect(evt: Event): void {  
  const file = (evt.target as HTMLInputElement).files?.[0];  
  if (!file) return;  
  const rdr = new FileReader();  
  rdr.onload = () => {  
    const src = rdr.result as string;  
    const im  = new Image();  
    im.onload = () => {  
      const shape: any = {  
        id: Date.now(), type: 'image',  
        x: 50, y: 50, w: im.width, h: im.height,  
        src, _img: im  
      };  
      this.store.updateShapes(arr => arr.push(shape));  
    };  
    im.src = src;  
  };  
  rdr.readAsDataURL(file);  
}  
}  
