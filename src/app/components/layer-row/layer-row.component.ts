import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-layer-row',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './layer-row.component.html',
  styleUrls: ['./layer-row.component.scss']
})
export class LayerRowComponent {
  @Input() index!: number;
  @Input() name!: string;
  @Input() selected = false;
  @Output() clickRow = new EventEmitter();
  @Output() rename = new EventEmitter<string>();

  editing = false;
  @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>;

  @HostListener('document:click', ['$event.target'])
  onOutsideClick(target: HTMLElement) {
    if (this.editing && !this.el.nativeElement.contains(target)) {
      this.finishEdit();
    }
  }

  constructor(private el: ElementRef) {}
  
  startRename() {
    this.editing = true;
    setTimeout(() => {
      const inp = this.inputEl.nativeElement;
      inp.focus();
      inp.select();
    }, 0);
  }    

  finishEdit() {
    const newVal = this.inputEl.nativeElement.value.trim();
    if (newVal && newVal !== this.name) {
      this.rename.emit(newVal);
    }
    this.editing = false;
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') this.finishEdit();
    if (e.key === 'Escape') this.editing = false;
    if (e.key === 'Backspace') e.stopPropagation();
  }

  onClick() {
    this.clickRow.emit();
  }
}