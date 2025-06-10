import { Component, Input, Output, EventEmitter, HostListener, OnInit, AfterViewChecked, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TmplAstBoundAttribute } from '@angular/compiler';

@Component({
    selector: 'app-comment-overlay',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './comment-overlay.component.html',
    styleUrls: ['./comment-overlay.component.scss'],
})
export class CommentOverlayComponent implements OnInit, AfterViewChecked {
    @ViewChild('editor', { static: false }) editor!: ElementRef<HTMLTextAreaElement>;
    @Input() id!: number;
    @Input() x!: number;
    @Input() y!: number;
    @Input() text: string = '';
    @Input() time: string = '';
    @Input() editing: boolean = false;
    @Output() deleted = new EventEmitter<number>();
    @Output() textChange = new EventEmitter<string>();
    @Output() moved = new EventEmitter<{ x: number; y: number }>();
    @Output() dragEnd = new EventEmitter<{ id: number; clientX: number; clientY: number }>();

    showTooltip = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private origX = 0;
    private origY = 0;
    dragging = false;
    private hasFocused = true;

    // Delay timer for hiding tooltip
    private hideTimeout: any;
    private isNew: boolean = false;

    constructor(private host: ElementRef) {}

    ngOnInit() {
        if (this.editing) {
            this.showTooltip = true;
            // Mark new comment to prevent immediate deletion on initial blur
            if (!this.text.trim()) {
                this.isNew = true;
            }
        }
    }

    ngAfterViewChecked() {
        // Auto-focus textarea when creating or editing
        if (this.editing && this.hasFocused) {
            this.hasFocused = false;
            setTimeout(() => {
                if (!this.editor) return;
                const ta = this.editor.nativeElement;
                ta.focus();
                const len = ta.value.length;
                ta.setSelectionRange(len, len);
                this.autoGrow({ target: ta } as any);
              }, 10);
        }
    }

    @HostListener('mouseenter')
    onMouseEnter() {
        // Clear hide timer and show tooltip immediately
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        if (!this.editing) {
            this.showTooltip = true;
        }
    }

    @HostListener('mouseleave')
    onMouseLeave() {
        // Delay hiding tooltip when not editing
        if (!this.editing) {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
            }
            this.hideTimeout = setTimeout(() => {
                this.showTooltip = false;
                this.hideTimeout = null;
            }, 1000);
        }
    }

    @HostListener('document:keydown.escape', ['$event'])
    onEscape(event: KeyboardEvent) {
        if (this.editing) {
            this.onTextBlur();
        }
    }

    @HostListener('document:mousedown', ['$event'])
    onDocumentMouseDown(event: MouseEvent) {
        if (!this.editing || !this.editor) return;
        const target = event.target as HTMLElement;
        const hostEl = this.host.nativeElement as HTMLElement;
        if (hostEl.contains(target)) return;
        this.onTextBlur();
    }

    onMarkerMouseDown(event: MouseEvent) {
        event.stopPropagation();
        this.dragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.origX = this.x;
        this.origY = this.y;
        window.addEventListener('mousemove', this.onDrag);
        window.addEventListener('mouseup', this.onMarkerMouseUp);
    }

    private onDrag = (event: MouseEvent) => {
        if (!this.dragging) return;
        this.x = this.origX + (event.clientX - this.dragStartX);
        this.y = this.origY + (event.clientY - this.dragStartY);
        this.moved.emit({ x: this.x, y: this.y });
    };

    private onMarkerMouseUp = (event: MouseEvent) => {
        this.dragging = false;
        window.removeEventListener('mousemove', this.onDrag);
        window.removeEventListener('mouseup', this.onMarkerMouseUp);
        this.dragEnd.emit({ id: this.id, clientX: event.clientX, clientY: event.clientY });
    };

    onTextClick() {
        // Enter editing mode and show tooltip, cancel hide timer
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        this.editing = true;
        this.showTooltip = true;
        this.hasFocused = true;
    }

    onTextBlur() {
        // Prevent closing during drag
        if (this.dragging) return;
        // If new and empty, just close editing, don't emit change or delete
        if (this.isNew && !this.text.trim()) {
            this.isNew = false;
            this.editing = false;
            return;
        }
        // Exit editing and emit text change
        this.isNew = false;
        this.editing = false;
        this.textChange.emit(this.text);
        // Delay hiding tooltip
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }
        this.hideTimeout = setTimeout(() => {
            this.showTooltip = false;
            this.hideTimeout = null;
        }, 1000);
    }

    onDelete(event: MouseEvent) {
        event.stopPropagation();
        this.deleted.emit(this.id);
    }

    onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.onTextBlur();
        }
    }

    autoGrow(event: Event) {
        const ta = event.target as HTMLTextAreaElement;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }
} 