import { AfterViewInit, Component, ElementRef, HostListener, Input, Output, ViewChild, OnDestroy, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import paper from 'paper';
import { Tool } from '../../models/tool.enum';
import { Shape, PathShape, TextShape, ImageShape, GroupShape, ShapeStyle } from '../../models/shape.model';
import { CanvasStore } from '../../services/canvas.store';
import { ShapeRendererService } from '../../services/shape-renderer.service';
import { SelectionRendererService, BoundingBoxConfig } from '../../services/selection-renderer.service';
import { CommentOverlayComponent } from '../comment-overlay/comment-overlay.component';

interface PaperItemWithId extends paper.Item {
    shapeId?: number;
}

// Simple comment data
interface CommentData { id: number; x: number; y: number; text: string; time: string; editing: boolean; }

@Component({
    selector: 'app-canvas',
    standalone: true,
    imports: [CommonModule, CommentOverlayComponent],
    templateUrl: './canvas.component.html',
    styleUrls: ['./canvas.component.scss'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy, OnChanges {
    // Comments overlay
    public comments: CommentData[] = [];

    @Input() tool: Tool = Tool.Move;
    @Output() toolChange = new EventEmitter<Tool>();

    @ViewChild('canvas', { static: true })
    private canvasRef!: ElementRef<HTMLCanvasElement>;

    // Public wrapper methods for DOM events
    public onMouseDown(event: MouseEvent): void {
        // Comment tool: create new comment marker and switch to Move
        if (this.tool === Tool.Comment) {
            const pt = this.getPoint(event);
            // Create timestamp
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const time = `${hours}:${minutes}`;
            // Add comment with open input
            this.comments.push({ id: Date.now(), x: pt.x, y: pt.y, text: '', time, editing: true });
            this.tool = Tool.Move;
            this.toolChange.emit(this.tool);
            return;
        }
        // Text tool: create new text shape and open for editing
        if (this.tool === Tool.Text) {
            const pt = this.getPoint(event);
            const style = this.store.activeStyle$.value;
            const textProps = this.store.activeTextProps$.value;
            const newShape: TextShape = {
                id: Date.now(),
                type: 'text',
                content: '',
                position: new paper.Point(pt.x, pt.y),
                fontSize: textProps.fontSize,
                fontFamily: textProps.fontFamily,
                justification: textProps.justification,
                style: { ...style, strokeEnabled: false }
            };
            this.store.updateShapes(shapes => shapes.push(newShape));
            this.store.select(newShape.id);
            return;
        }
        // Clear marquee selection when starting a new action
        this.marqueeActive = false;
        this.marqueeStart = null;
        this.marqueeEnd = null;
        
        if (!this.project?.view) return;

        const toolEvent = this.createToolEvent(event, 'mousedown');
        this.handleMouseDown(toolEvent);
    }

    public onMouseMove(event: MouseEvent): void {
        if (!this.project?.view) return;

        const toolEvent = this.createToolEvent(event, 'mousemove');
        if (event.buttons === 1) {
            this.handleMouseDrag(toolEvent);
        } else {
            this.handleMouseMove(toolEvent);
        }
    }

    public onMouseUp(event: MouseEvent): void {
        // Skip default handling for Text tool
        if (this.tool === Tool.Text) {
            return;
        }
        if (!this.project?.view) return;

        const toolEvent = this.createToolEvent(event, 'mouseup');
        this.handleMouseUp(toolEvent);
        // Reset mouse tracking state
        this.lastMousePoint = null;
        this.dragStartPoint = null;
    }

    // Paper.js specific properties
    private project!: paper.Project;
    private mainLayer!: paper.Layer;
    private guideLayer!: paper.Layer;
    private selectionLayer!: paper.Layer;

    // Tool states
    private paperTool!: paper.Tool;
    private currentPath: paper.Path | null = null;
    private hoveredItem: PaperItemWithId | null = null;
    private selectedItems: Set<PaperItemWithId> = new Set();
    private movingItem: PaperItemWithId | null = null;
    private resizingItem: PaperItemWithId | null = null;

    // Mouse interaction state
    private dragStartPoint: paper.Point | null = null;
    private lastMousePoint: paper.Point | null = null;
    private moveOffset!: paper.Point;

    // Resize handle state
    private readonly HANDLE_SIZE = 8;
    private activeHandle: 'nw' | 'ne' | 'se' | 'sw' | null = null;
    private initialBounds: paper.Rectangle | null = null;

    // Initial positions for move operation
    private initialPositions: Map<number, paper.Point> = new Map();
    // For resize operation
    private initialShapeCopy: Shape | null = null;
    private resizeOrigin: paper.Point | null = null;
    private initialPaperItem: paper.Path | null = null; // for path resizing
    private initialPaperGroup: paper.Group | null = null; // for group resizing

    // Bounding box style configuration
    private readonly boundingBoxConfig = {
        padding: 0,
        strokeColor: '#0c8ce9',
        strokeWidth: 2,
        handleSize: 8,
        handleFillColor: 'white',
        handleStrokeColor: '#0c8ce9',
        handleStrokeWidth: 1,
        selectionFillColor: 'rgba(12,140,233,0.1)',
        dimensionsBoxHeight: 18,
        dimensionsFontSize: 11,
        dimensionsPadding: 4,
        dimensionsYOffset: 13,
    };

    // --- Marquee selection state ---
    private marqueeActive: boolean = false;
    private marqueeStart: paper.Point | null = null;
    private marqueeEnd: paper.Point | null = null;

    private subscriptions: Subscription[] = [];

    private previewClones: PaperItemWithId[] = []; // for live move preview

    private hasDragged: boolean = false;
    // State for multi-select and group resizing
    private resizingMultiple: boolean = false;
    private initialShapesCopy: Map<number, Shape> = new Map();
    // Map of shapeId to cloned Paper.js item (path or group) for multi-resize
    private initialPaperItemsMap: Map<number, paper.Item> = new Map();

    constructor(private store: CanvasStore, private renderer: ShapeRendererService, private selectionRenderer: SelectionRendererService) {}

    ngAfterViewInit(): void {
        // Setup canvas
        const canvas = this.canvasRef.nativeElement;
        paper.setup(canvas);
        this.project = paper.project;

        // Set canvas size
        this.project.view.viewSize = new paper.Size(
            canvas.offsetWidth,
            canvas.offsetHeight
        );

        // Initialize moveOffset after Paper.js is set up
        this.moveOffset = new paper.Point(0, 0);

        // Create layers for different purposes
        this.mainLayer = new paper.Layer();
        this.mainLayer.name = 'mainLayer';
        this.mainLayer.activate();

        this.guideLayer = new paper.Layer();
        this.guideLayer.name = 'guideLayer';

        this.selectionLayer = new paper.Layer();
        this.selectionLayer.name = 'selectionLayer';

        // Initialize Paper.js tool
        this.setupPaperTool();

        // Subscribe to store changes
        this.subscribeToStore();

        // Initial render
        this.updateCanvas();
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
        this.project.remove();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['tool'] && changes['tool'].currentValue !== Tool.Move) {
            this.store.clearSelection();
            this.selectedItems.clear();
            this.hoveredItem = null;
            this.updateCanvas();
        }
    }

    private setupPaperTool(): void {
        this.paperTool = new paper.Tool();

        this.paperTool.onMouseDown = (event: paper.ToolEvent) => {
            this.handleMouseDown(event);
        };

        this.paperTool.onMouseDrag = (event: paper.ToolEvent) => {
            this.handleMouseDrag(event);
        };

        this.paperTool.onMouseMove = (event: paper.ToolEvent) => {
            this.handleMouseMove(event);
        };

        this.paperTool.onMouseUp = (event: paper.ToolEvent) => {
            this.handleMouseUp(event);
        };

        // Activate the tool
        this.paperTool.activate();
    }

    private handleMouseDown(event: paper.ToolEvent): void {
        // console.log('handleMouseDown at', event.point);
        this.hasDragged = false;
        const point = event.point;
        this.dragStartPoint = point;
        this.lastMousePoint = point;

        // console.log('selectionLayer items data handles:', this.selectionLayer.children.map(ch => ch.data));
        // Check for click on a resize handle path in selectionLayer
        const handleHit = this.project.hitTest(point, {
            fill: true,
            stroke: true,
            tolerance: this.boundingBoxConfig.handleSize,
            match: (res: paper.HitResult) => res.item.layer === this.selectionLayer && (res.item.data as any)?.handle
        });
        if (handleHit?.item) {
            const handleName = (handleHit.item.data as any).handle as 'nw' | 'ne' | 'se' | 'sw';
            this.activeHandle = handleName;
            this.resizeOrigin = point;
            const items = Array.from(this.selectedItems);
            if (items.length > 1) {
                // Multi-select resizing
                this.resizingMultiple = true;
                // Compute union bounds
                let unionBounds = items[0].bounds.clone();
                for (let i = 1; i < items.length; i++) unionBounds = unionBounds.unite(items[i].bounds);
                this.initialBounds = unionBounds.clone();
                // Snapshot each selected shape model and initial Path for paths
                this.initialShapesCopy.clear();
                this.initialPaperItemsMap.clear();
                items.forEach(item => {
                    const id = item.shapeId;
                    if (id != null) {
                        const shapeModel = this.store.shapes$.value.find(s => s.id === id);
                        if (shapeModel) {
                            this.initialShapesCopy.set(id, JSON.parse(JSON.stringify(shapeModel)) as Shape);
                            // Snapshot each Paper.js item for multi-resize
                            if (item instanceof paper.Path) {
                                this.initialPaperItemsMap.set(id, item.clone({ insert: false }));
                            } else if (item instanceof paper.Group) {
                                this.initialPaperItemsMap.set(id, item.clone({ insert: false }));
                            }
                        }
                    }
                });
            } else {
                // Single shape or group resizing
                this.resizingMultiple = false;
                this.resizingItem = items[0];
                this.initialBounds = this.resizingItem.bounds.clone();
                const id = this.resizingItem.shapeId;
                if (id != null) {
                    const shapeModel = this.store.shapes$.value.find(s => s.id === id);
                    this.initialShapeCopy = shapeModel ? JSON.parse(JSON.stringify(shapeModel)) as Shape : null;
                }
                if (this.resizingItem instanceof paper.Path) {
                    this.initialPaperItem = this.resizingItem.clone({ insert: false }) as paper.Path;
                } else if (this.resizingItem instanceof paper.Group) {
                    this.initialPaperGroup = this.resizingItem.clone({ insert: false }) as paper.Group;
                }
            }
            this.updateCanvas();
            return;
        }

        if (this.tool === Tool.Move) {
            // Allow multi-select drag: compute union bounds for detection, but use same multi-clone logic
            let expandedUnion: paper.Rectangle | null = null;
            if (this.selectedItems.size > 1) {
                const items = Array.from(this.selectedItems);
                let unionBounds = items[0].bounds.clone();
                for (let i = 1; i < items.length; i++) {
                    unionBounds = unionBounds.unite(items[i].bounds);
                }
                expandedUnion = unionBounds.expand(this.boundingBoxConfig.padding);
            }
            let hitSelectedItem = false;
            // Check if clicked within any selected item's bounds or within union bounds
            for (const selItem of this.selectedItems) {
                const expandedBounds = expandedUnion || selItem.bounds.expand(this.boundingBoxConfig.padding);
                if (expandedBounds.contains(point)) {
                    this.movingItem = selItem;
                    this.moveOffset = point.subtract(selItem.position);
                    hitSelectedItem = true;
                    // Record initial positions for move
                    this.initialPositions.clear();
                    this.selectedItems.forEach(it => {
                        if (it.shapeId != null) {
                            this.initialPositions.set(it.shapeId, it.position.clone());
                        }
                    });
                    // Unified live-preview clones logic (same as for unselected start)
                    // Snapshot original indices before any store updates
                    const originalsUnified = Array.from(this.selectedItems);
                    const originalsUnifiedWithIndices = originalsUnified.map(item => ({
                        item,
                        index: this.mainLayer.children.indexOf(item)
                    })).sort((a, b) => b.index - a.index);
                    // Create live-preview clones and hide originals, preserving exact z-order
                    this.previewClones = [];
                    originalsUnifiedWithIndices.forEach(({ item, index }) => {
                        const shape = this.store.shapes$.value.find(s => s.id === item.shapeId);
                        if (!shape) return;
                        const clone = this.renderer.createPaperItem(shape) as PaperItemWithId;
                        clone.shapeId = shape.id;
                        this.mainLayer.insertChild(index, clone);
                        this.previewClones.push(clone);
                    });
                    // Replace selectedItems with clones and update movingItem reference
                    const origMovingId = this.movingItem?.shapeId;
                    this.selectedItems.clear();
                    this.previewClones.forEach(clone => this.selectedItems.add(clone));
                    if (origMovingId != null) {
                        this.movingItem = this.previewClones.find(c => c.shapeId === origMovingId) || null;
                    }
                    this.selectionLayer.removeChildren();
                    // Render preview clones
                    this.project.view.update();
                    // Update store selection for single-select
                    if (origMovingId != null && this.selectedItems.size <= 1) {
                        if (event.modifiers.shift) {
                            this.store.toggle(origMovingId);
                        } else {
                            this.store.select(origMovingId);
                        }
                    }
                    // Final render (still in preview mode)
                    this.updateCanvas();
                    return;
                }
            }

            if (!hitSelectedItem) {
                // Regular hit testing for unselected shapes
                const hitResult = this.project.hitTest(point, {
                    fill: true,
                    stroke: true,
                    segments: true,
                    pixel: true,
                    tolerance: 5,
                    match: (result: paper.HitResult) => result.item.layer === this.mainLayer
                });

                if (hitResult?.item) {
                    // Find top-level item with shapeId (e.g., for images wrapped in groups)
                    let item = hitResult.item as PaperItemWithId;
                    while (item && item.shapeId == null) {
                        item = item.parent as PaperItemWithId;
                    }
                    if (item?.shapeId) {
                        if (!event.modifiers.shift) {
                            this.selectedItems.clear();
                        }
                        this.selectedItems.add(item);
                        this.movingItem = item;
                        this.moveOffset = point.subtract(item.position);
                        // Record initial positions for move
                        this.initialPositions.clear();
                        this.selectedItems.forEach(it => {
                            if (it.shapeId != null) {
                                this.initialPositions.set(it.shapeId, it.position.clone());
                            }
                        });
                        // Create live-preview clones and hide originals, preserving exact z-order
                        const originals2 = Array.from(this.selectedItems);
                        const originals2WithIndices = originals2.map(item => ({
                            item,
                            index: this.mainLayer.children.indexOf(item)
                        })).sort((a, b) => b.index - a.index);
                        this.previewClones = [];
                        originals2WithIndices.forEach(({ item, index }) => {
                            const shape = this.store.shapes$.value.find(s => s.id === item.shapeId);
                            if (!shape) return;
                            const clone = this.renderer.createPaperItem(shape) as PaperItemWithId;
                            clone.shapeId = shape.id;
                            this.mainLayer.insertChild(index, clone);
                            this.previewClones.push(clone);
                        });
                        // Replace selectedItems with clones and update movingItem to clone
                        const origMovingId2 = this.movingItem?.shapeId;
                        this.selectedItems.clear();
                        this.previewClones.forEach(clone => this.selectedItems.add(clone));
                        if (origMovingId2 != null) {
                            this.movingItem = this.previewClones.find(c => c.shapeId === origMovingId2) || null;
                        }
                        this.selectionLayer.removeChildren();
                        this.project.view.update();
                        // Update store selection
                        if (event.modifiers.shift) {
                            this.store.toggle(item.shapeId);
                        } else {
                            this.store.select(item.shapeId);
                        }
                        this.updateCanvas();
                    } else {
                        // Clicked on empty space - start marquee selection
                        this.selectedItems.clear();
                        this.store.clearSelection();
                        this.marqueeActive = true;
                        this.marqueeStart = point;
                        this.marqueeEnd = point;
                        this.updateCanvas();
                    }
                } else {
                    // Clicked on empty space - start marquee selection
                    this.selectedItems.clear();
                    this.store.clearSelection();
                    this.marqueeActive = true;
                    this.marqueeStart = point;
                    this.marqueeEnd = point;
                    this.updateCanvas();
                }
            } else {
                // Preview existing selection move
                this.updateCanvas();
            }
            return;
        }

        // Handle other tools
        switch (this.tool) {
            case Tool.Pen: {
                const style = this.store.activeStyle$.value;
                const strokeColor = style.strokeEnabled && style.stroke && typeof style.stroke === 'string'
                    ? new paper.Color(style.stroke)
                    : null;
                const fillColor = null; // no fill preview for pen

                this.currentPath = new paper.Path({
                    segments: [point],
                    strokeColor,
                    strokeWidth: style.strokeWidth || 2,
                    strokeCap: 'round',
                    strokeJoin: 'round',
                    fillColor
                });
                this.mainLayer.addChild(this.currentPath);
                this.currentPath.selected = false;
                break;
            }

            case Tool.Rect: {
                const style = this.store.activeStyle$.value;
                const strokeColor = null;
                const fillColor = style.fillEnabled && style.fill && typeof style.fill === 'string'
                    ? new paper.Color(style.fill)
                    : null;

                const rect = new paper.Rectangle(point, point.add(new paper.Point(1, 1)));
                this.currentPath = new paper.Path.Rectangle({ rectangle: rect, strokeColor, strokeWidth: style.strokeWidth || 2, fillColor });
                // Mark as rectangle for corner radius support
                this.currentPath.data = { cornerRadius: 0 };
                this.mainLayer.addChild(this.currentPath);
                break;
            }

            case Tool.Ellipse: {
                const style = this.store.activeStyle$.value;
                const strokeColor = null; // no stroke preview for ellipse
                const fillColor = style.fillEnabled && style.fill && typeof style.fill === 'string'
                    ? new paper.Color(style.fill)
                    : null;

                // Create ellipse with minimal size 1x1
                this.currentPath = new paper.Path.Ellipse({
                    rectangle: new paper.Rectangle(point, point.add(new paper.Point(1, 1))),
                    strokeColor,
                    strokeWidth: style.strokeWidth || 2,
                    fillColor
                });
                this.mainLayer.addChild(this.currentPath);
                break;
            }

            case Tool.Line: {
                const style = this.store.activeStyle$.value;
                const strokeColor = style.strokeEnabled && style.stroke ? new paper.Color(style.stroke) : null;
                const strokeWidth = style.strokeWidth || 2;
                // Create line with zero length initially
                this.currentPath = new paper.Path.Line({
                    from: event.point,
                    to: event.point,
                    strokeColor,
                    strokeWidth
                });
                this.mainLayer.addChild(this.currentPath);
                this.currentPath.data = { type: 'line' };
                break;
            }
        }

        this.resizingItem = null;
        this.activeHandle = null;

        // Ensure selection is up to date
        this.updateSelection();
        this.updateCanvas();
    }

    private handleMouseDrag(event: paper.ToolEvent): void {
        const point = event.point;
        const delta = event.delta;
        if (this.movingItem) this.hasDragged = true;

        // Resize: update store shapes based on initial copy and origin
        if ((this.resizingItem || this.resizingMultiple) && this.activeHandle && this.initialBounds && this.resizeOrigin) {
            if (this.resizingMultiple) {
                this.updateResizedShapesMultiple(point);
            } else {
                this.updateResizedShape(point);
            }
            this.updateCanvas();
            return;
        }

        // Marquee selection update
        if (this.marqueeActive && this.marqueeStart) {
            this.marqueeEnd = point;
            this.updateCanvas();
            return;
        }

        // Live preview: move clones rather than originals
        if (this.movingItem && this.dragStartPoint) {
            const deltaFromStart = event.point.subtract(this.dragStartPoint);
            this.previewClones.forEach(clone => {
                const id = clone.shapeId;
                const start = id != null ? this.initialPositions.get(id) : null;
                if (start) {
                    clone.position = start.add(deltaFromStart);
                }
            });
            this.project.view.update(); // render clones
            return;
        }

        if (this.currentPath) {
            switch (this.tool) {
                case Tool.Pen:
                    this.currentPath.add(point);
                    this.currentPath.selected = false;
                    this.updateCanvas();
                    break;

                case Tool.Rect:
                case Tool.Ellipse: {
                    const topLeft = new paper.Point(
                        Math.min(this.dragStartPoint!.x, point.x),
                        Math.min(this.dragStartPoint!.y, point.y)
                    );
                    const bottomRight = new paper.Point(
                        Math.max(this.dragStartPoint!.x, point.x),
                        Math.max(this.dragStartPoint!.y, point.y)
                    );
                    const minW = Math.max(1, bottomRight.x - topLeft.x);
                    const minH = Math.max(1, bottomRight.y - topLeft.y);
                    const rect = new paper.Rectangle(topLeft, new paper.Size(minW, minH));
                    if (this.tool === Tool.Rect) {
                        (this.currentPath as paper.Path.Rectangle).bounds = rect;
                    } else {
                        (this.currentPath as paper.Path.Ellipse).bounds = rect;
                    }
                    this.updateCanvas();
                    break;
                }

                case Tool.Line: {
                    // Update line endpoint
                    const line = this.currentPath as paper.Path;
                    line.firstSegment.point = this.dragStartPoint!;
                    line.lastSegment.point = event.point;
                    this.updateCanvas();
                    break;
                }
            }
        }

        this.lastMousePoint = point;
        this.updateCanvas();
    }

    private handleMouseMove(event: paper.ToolEvent): void {
        this.lastMousePoint = event.point;
        // Marquee selection update
        if (this.marqueeActive && this.marqueeStart) {
            this.marqueeEnd = event.point;
            this.updateCanvas();
            return;
        }
        // Determine hovered item using hitTestAll and z-order
        let hovered: PaperItemWithId | null = null;
        const hits = this.project.hitTestAll(event.point, {
            fill: true,
            stroke: true,
            segments: true,
            pixel: true,
            tolerance: 5,
            match: (result: paper.HitResult) => result.item.layer === this.mainLayer
        });
        if (hits.length) {
            const hitItems = hits.map(r => {
                let it = r.item as PaperItemWithId;
                while (it && it.shapeId == null) {
                    it = it.parent as PaperItemWithId;
                }
                return it;
            });
            const children = this.mainLayer.children as PaperItemWithId[];
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                if (hitItems.includes(child)) {
                    hovered = child;
                    break;
                }
            }
        }
        // Fallback: if single shape selected and point within its bounds
        if (!hovered && this.selectedItems.size === 1) {
            const selItem = Array.from(this.selectedItems)[0];
            if (selItem.bounds.contains(event.point)) {
                hovered = selItem;
            }
        }
        this.hoveredItem = hovered;
        this.updateCanvas();
    }

    private handleMouseUp(event: paper.ToolEvent): void {
        // console.log('[canvas] handleMouseUp start, tool:', this.tool, 'selectedIds:', Array.from(this.store.selectedIds$.value));
        if (this.marqueeActive && this.marqueeStart && this.marqueeEnd) {
            const x1 = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
            const y1 = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
            const x2 = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
            const y2 = Math.max(this.marqueeStart.y, this.marqueeEnd.y);
            if (x2 - x1 > 2 || y2 - y1 > 2) {
                // Select all objects intersecting the marquee
                const selectedIds = new Set<number>();
                for (const item of this.mainLayer.children) {
                    const bounds = item.bounds;
                    if (!(bounds.right < x1 || bounds.left > x2 || bounds.bottom < y1 || bounds.top > y2)) {
                        const paperItem = item as PaperItemWithId;
                        if (paperItem.shapeId) selectedIds.add(paperItem.shapeId);
                    }
                }
                this.store.selectedIds$.next(selectedIds);
            }
            this.marqueeActive = false;
            this.marqueeStart = null;
            this.marqueeEnd = null;
            this.updateCanvas();
            return;
        }

        if (this.currentPath) {
            let shape = this.pathToShape(this.currentPath);
            // Override default style based on tool
            switch (this.tool) {
                case Tool.Pen:
                case Tool.Line:
                    shape.style = {
                        ...shape.style,
                        stroke: '#000000',
                        fill: '#d9d9d9',
                        strokeEnabled: true,
                        fillEnabled: false,
                        strokeWidth: 2
                    };
                    break;
                case Tool.Rect:
                case Tool.Ellipse:
                    shape.style = {
                        ...shape.style,
                        stroke: '#000000',
                        fill: '#d9d9d9',
                        strokeEnabled: false,
                        fillEnabled: true,
                        strokeWidth: 2
                    };
                    break;
            }
            // Inherit shadow settings
            const active = this.store.activeStyle$.value;
            shape.style.shadowBlur = active.shadowBlur;
            shape.style.shadowOffset = active.shadowOffset;
            shape.style.shadowColor = active.shadowColor;
            this.store.updateShapes(shapes => {
                shapes.push(shape);
            });
            
            // Select the newly created shape
            this.store.select(shape.id);
            this.currentPath.remove();
            this.currentPath = null;
        }

        // If click (no drag) on selected clone, switch selection only if single-select (ignore for multi-select)
        if (this.movingItem && !this.hasDragged && this.store.selectedIds$.value.size <= 1) {
            const id = this.movingItem.shapeId;
            if (id != null) {
                this.store.select(id);
            }
        }
        // Commit moving changes to the store before clearing state
        // Debug: log cursor movement delta and final position for text shapes
        {
            // Debug: cursor movement delta
            if (this.dragStartPoint) {
                const upPoint = event.point;
                const delta = upPoint.subtract(this.dragStartPoint);
            }
            const textIds = Array.from(this.store.selectedIds$.value).filter(id => {
                const sh = this.store.shapes$.value.find(s => s.id === id);
                return sh?.type === 'text';
            });
            textIds.forEach(id => {
                // Debug: model position before commit
                const model = this.store.shapes$.value.find(s => s.id === id);
                if (model && model.type === 'text') {
                    console.log('[Text Model Debug] id=', id, 'model.position=', (model as TextShape).position);
                }
                const initPos = this.initialPositions.get(id);
                let cloneItem: any = null;
                this.selectedItems.forEach(it => { if (it.shapeId === id) cloneItem = it; });
                if (cloneItem) {
                    console.log(`[Text Move Debug] id=${id}`, 'initialPos=', initPos, 'clonePos=', cloneItem.position, 'boundsCenter=', cloneItem.bounds.center);
                }
            });
        }
        if (this.movingItem) {
            this.store.updateShapes(shapes => {
                this.selectedItems.forEach(item => {
                    const id = item.shapeId;
                    if (id != null) {
                        const shape = shapes.find(s => s.id === id);
                        if (shape) {
                            const bounds = item.bounds;
                            if (shape.type === 'path') {
                                const pathItem = item as paper.Path;
                                // Assign segments directly to persist path shape
                                (shape as PathShape).segments = pathItem.segments;
                                (shape as PathShape).closed = pathItem.closed;
                            } else if (shape.type === 'image') {
                                // Commit image move: update center position and size
                                (shape as ImageShape).position = bounds.center;
                                (shape as ImageShape).size = new paper.Size(bounds.width, bounds.height);
                            } else if (shape.type === 'group') {
                                // Commit group move: read each child item's final bounds/segments
                                const groupItem = item as paper.Group;
                                const childrenData = (shape as GroupShape).children;
                                groupItem.children.forEach((childItem, idx) => {
                                    const childData = childrenData[idx];
                                    const bounds = childItem.bounds;
                                    if (childData.type === 'path') {
                                        const pathItem = childItem as paper.Path;
                                        (childData as PathShape).segments = pathItem.segments;
                                        (childData as PathShape).closed = pathItem.closed;
                                    } else if (childData.type === 'image') {
                                        (childData as ImageShape).position = childItem.position as paper.Point;
                                        (childData as ImageShape).size = new paper.Size(bounds.width, bounds.height);
                                    }
                                });
                            } else if (shape.type === 'text') {
                                // Commit text move: use clone position as text origin
                                (shape as TextShape).position = (item as paper.PointText).position.clone();
                            }
                        }
                    }
                });
            });
        }

        // Clean up preview clones
        this.previewClones.forEach(clone => clone.remove());
        this.previewClones = [];
        // Force re-selection of moved objects to restore bounding box
        const sel = new Set(this.store.selectedIds$.value);
        this.store.selectedIds$.next(sel);

        // Clear moving/resizing state before redraw
        this.movingItem = null;
        this.resizingItem = null;
        this.activeHandle = null;

        // Re-render selection and canvas after move ends
        this.updateSelection();
        this.updateCanvas();
        this.handleMouseMove(event);

        // Reset tool to Move after drawing
        this.tool = Tool.Move;
        this.toolChange.emit(this.tool);

        // Clear initial positions map after move
        this.initialPositions.clear();
        // Clear resize state
        this.initialShapeCopy = null;
        this.resizeOrigin = null;
        this.initialPaperItem = null;
        this.initialPaperGroup = null;
        // Reset multi-resize flag so hover reappears
        this.resizingMultiple = false;
    }

    private moveSelectedItems(delta: paper.Point): void {
        if (!this.movingItem) return;
        this.selectedItems.forEach(item => {
            item.position = item.position.add(delta);
        });
    }

    private resizeShape(item: PaperItemWithId, point: paper.Point): void {
        if (!this.activeHandle || !this.initialBounds) return;

        const originalBounds = this.initialBounds;
        const newBounds = originalBounds.clone();

        switch (this.activeHandle) {
            case 'nw':
                newBounds.topLeft = point;
                break;
            case 'ne':
                newBounds.topRight = point;
                break;
            case 'se':
                newBounds.bottomRight = point;
                break;
            case 'sw':
                newBounds.bottomLeft = point;
                break;
        }

        // Ensure minimum size
        if (newBounds.width < 10) newBounds.width = 10;
        if (newBounds.height < 10) newBounds.height = 10;

        item.bounds = newBounds;
        this.updateSelection();
    }

    private hitTestHandle(point: paper.Point): 'nw' | 'ne' | 'se' | 'sw' | null {
        if (this.selectedItems.size !== 1) return null;

        const item = Array.from(this.selectedItems)[0];
        const bounds = item.bounds;
        const expandedBounds = bounds.expand(this.boundingBoxConfig.padding);
        const halfHandle = this.boundingBoxConfig.handleSize / 2;

        const handles = {
            nw: expandedBounds.topLeft,
            ne: expandedBounds.topRight,
            se: expandedBounds.bottomRight,
            sw: expandedBounds.bottomLeft
        };

        for (const [handle, pos] of Object.entries(handles)) {
            const handleBounds = new paper.Rectangle(
                pos.x - halfHandle,
                pos.y - halfHandle,
                this.boundingBoxConfig.handleSize,
                this.boundingBoxConfig.handleSize
            );
            if (handleBounds.contains(point)) {
                return handle as 'nw' | 'ne' | 'se' | 'sw';
            }
        }

        return null;
    }

    private updateSelection(): void {
        // Delegate selection rendering to service
        this.selectionRenderer.renderSelection(
            this.selectionLayer,
            this.selectedItems,
            this.boundingBoxConfig as BoundingBoxConfig
        );
    }

    private updateCanvas(): void {
        if (this.previewClones && this.previewClones.length > 0) {
            // Preview move: hide only originals of selected shapes, leave others visible
            const selIds = new Set<number>(this.previewClones.map(c => c.shapeId!));
            this.mainLayer.children.forEach(child => {
                const pi = child as PaperItemWithId;
                if (pi.shapeId != null && selIds.has(pi.shapeId) && !this.previewClones.includes(pi)) {
                    child.visible = false;
                } else {
                    child.visible = true;
                }
            });
            // Clear selection and hover outlines during preview
            this.selectionLayer.removeChildren();
            this.guideLayer.removeChildren();
            // Force render
            this.project.view.update();
            return;
        }
        const shapes = this.store.shapes$.value;
        // console.log('Updating canvas, shapes:', shapes);
        
        // Clear layers
        this.mainLayer.removeChildren();
        this.guideLayer.removeChildren();
        this.selectionLayer.removeChildren();

        // Recreate all shapes from store
        shapes.forEach(shape => {
            if (this.store.hideComments$.value && shape.type === 'text') return;
            
            // Delegate creation to ShapeRendererService
            const item = this.renderer.createPaperItem(shape);
            if (item) {
                (item as PaperItemWithId).shapeId = shape.id;
                // Store Paper.js item reference for UI (e.g., sidebar dims)
                shape.paperObject = item;
                this.mainLayer.addChild(item);
                // console.log('Added item to mainLayer:', { id: shape.id, type: shape.type });
            } else {
                console.warn('Failed to create item for shape:', shape);
            }
        });

        // Render selection visuals (skip during move)
        if (!this.movingItem) {
            this.selectionRenderer.renderSelection(this.selectionLayer, this.selectedItems, this.boundingBoxConfig as BoundingBoxConfig);
        }

        // Render marquee selection
        if (this.marqueeActive && this.marqueeStart && this.marqueeEnd) {
            this.selectionRenderer.renderMarquee(this.guideLayer, this.marqueeStart, this.marqueeEnd);
        }

        // Hover outline (skip if disabled)
        if (!this.store.hideHover$.value && this.tool === Tool.Move && !this.movingItem && !this.resizingItem && !this.resizingMultiple && this.selectedItems.size <= 1) {
            this.selectionRenderer.renderHover(this.guideLayer, this.hoveredItem, this.boundingBoxConfig as BoundingBoxConfig);
        }

        // --- Preview for currentPath (pen, rect, ellipse) ---
        if (this.currentPath) {
            // Re-add preview path after layer cleared
            this.mainLayer.addChild(this.currentPath);
            this.currentPath.bringToFront();
            this.currentPath.selected = false;
        }
        // Force redraw to apply shadows and style changes
        this.project.view.update();
    }

    private pathToShape(path: paper.Path): Shape {
        const id = Date.now();
        const style: ShapeStyle = {
            stroke: path.strokeColor?.toCSS(true),
            strokeWidth: path.strokeWidth,
            fill: path.fillColor?.toCSS(true),
            opacity: path.opacity,
            strokeEnabled: !!path.strokeColor,
            fillEnabled: !!path.fillColor
        };

        // Always treat shapes as paths
        const shape = {
            id,
            type: 'path',
            segments: path.segments.map(seg => ({
                point: { x: seg.point.x, y: seg.point.y },
                handleIn: seg.handleIn ? { x: seg.handleIn.x, y: seg.handleIn.y } : undefined,
                handleOut: seg.handleOut ? { x: seg.handleOut.x, y: seg.handleOut.y } : undefined
            })),
            closed: path.closed,
            style
        } as PathShape;
        // Propagate corner radius for rectangle paths
        if (path.data && (path.data.cornerRadius != null)) {
            (shape as any).cornerRadius = path.data.cornerRadius;
        }
        return shape;
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyDown(event: KeyboardEvent): void {
        // Ignore Delete/Backspace when focus is on an input or editable element
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }

        // Clear selection on Escape key
        if (event.key === 'Escape' && !event.repeat) {
            this.store.clearSelection();
            this.selectedItems.clear();
            this.hoveredItem = null;
            this.updateCanvas();
            event.preventDefault();
            return;
        }

        if ((event.key === 'Delete' || event.key === 'Backspace') && !event.repeat) {
            // Remove all selected shapes in place
            const selectedIds = Array.from(this.store.selectedIds$.value);
            if (selectedIds.length > 0) {
                this.store.updateShapes(shapes => {
                    // Remove all selected shapes in place
                    for (let i = shapes.length - 1; i >= 0; i--) {
                        if (selectedIds.includes(shapes[i].id)) {
                            shapes.splice(i, 1);
                        }
                    }
                });
                this.selectedItems.clear();
                this.store.clearSelection();
                this.hoveredItem = null; // Clear hover outline after deletion
                this.updateCanvas();
            }
            event.preventDefault();
        }
    }

    @HostListener('window:resize')
    onResize(): void {
        const canvas = this.canvasRef.nativeElement;
        this.project.view.viewSize = new paper.Size(
            canvas.offsetWidth,
            canvas.offsetHeight
        );
        this.updateCanvas();
    }

    // Helper methods to streamline event conversion
    private getPoint(event: MouseEvent): paper.Point {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        return new paper.Point(event.clientX - rect.left, event.clientY - rect.top);
    }

    private mapModifiers(event: MouseEvent): Record<string, boolean> {
        return {
            shift: event.shiftKey,
            control: event.ctrlKey,
            alt: event.altKey,
            command: event.metaKey,
            capsLock: event.getModifierState('CapsLock'),
            space: event.getModifierState(' '),
            option: event.altKey
        };
    }

    private createToolEvent(event: MouseEvent, type: 'mousedown' | 'mousemove' | 'mouseup'): paper.ToolEvent {
        const point = this.getPoint(event);
        const lastPoint = this.lastMousePoint || point;
        const downPoint = this.dragStartPoint || point;
        const delta = this.lastMousePoint ? point.subtract(this.lastMousePoint) : new paper.Point(0, 0);
        const modifiers = this.mapModifiers(event);
        return {
            point,
            lastPoint,
            downPoint,
            middlePoint: point,
            delta,
            count: 0,
            item: null,
            type,
            event: event as unknown as Event,
            modifiers,
            timeStamp: event.timeStamp,
            preventDefault: () => event.preventDefault(),
            stopPropagation: () => event.stopPropagation(),
            stop: () => {
                event.preventDefault();
                event.stopPropagation();
            }
        } as unknown as paper.ToolEvent;
    }

    // Encapsulate store subscriptions to declutter lifecycle hook
    private subscribeToStore(): void {
        this.subscriptions.push(
            this.store.shapes$.subscribe(() => {
                // console.log('Shapes updated in store, updating canvas');
                this.updateCanvas();

                // Re-sync selectedItems with store after shapes update
                const selectedIds = this.store.selectedIds$.value;
                this.selectedItems.clear();
                const children = this.mainLayer.children;
                selectedIds.forEach(id => {
                    for (const item of children) {
                        const paperItem = item as PaperItemWithId;
                        if (paperItem.shapeId === id) {
                            this.selectedItems.add(paperItem);
                            break;
                        }
                    }
                });
                this.updateSelection();
            }),
            this.store.selectedIds$.subscribe((selectedIds) => {
                this.selectedItems.clear();
                const shapes = this.mainLayer?.children || [];
                selectedIds.forEach(id => {
                    for (const item of shapes) {
                        const paperItem = item as PaperItemWithId;
                        if (paperItem.shapeId === id) {
                            this.selectedItems.add(paperItem);
                            break;
                        }
                    }
                });
                this.updateSelection();
            }),
            this.store.hideComments$.subscribe(() => {
                // console.log('Comment visibility updated');
                this.updateCanvas();
            }),
            this.store.activeStyle$.subscribe(() => {
                // console.log('Active style changed, updating canvas');
                this.updateCanvas();
            })
        );
    }

    /**
     * General resizing logic adapted from old updateResizedShape(s, p)
     */
    private updateResizedShape(p: paper.Point): void {
        const orig = this.initialShapeCopy!;
        const oB = this.initialBounds!;
        const id = this.resizingItem!.shapeId!;
        const dx = p.x - this.resizeOrigin!.x;
        const dy = p.y - this.resizeOrigin!.y;
        const signX = (this.activeHandle === 'ne' || this.activeHandle === 'se') ? 1 : -1;
        const signY = (this.activeHandle === 'se' || this.activeHandle === 'sw') ? 1 : -1;
        const newW = Math.max(10, oB.width + dx * signX);
        const newH = Math.max(10, oB.height + dy * signY);
        const kx = newW / oB.width;
        const ky = newH / oB.height;
        this.store.updateShapes(shapes => {
            const s = shapes.find(sh => sh.id === id);
            if (!s) return;
            switch (s.type) {
                case 'path': {
                    // Resize path: update model segments based on initial clone
                    const pathOrig = this.initialPaperItem!;
                    // Determine pivot corner (opposite handle)
                    const pivot = new paper.Point(
                        signX > 0 ? oB.left : oB.right,
                        signY > 0 ? oB.top : oB.bottom
                    );
                    // Scale the cloned path
                    const scaledPath = pathOrig.clone();
                    scaledPath.scale(kx, ky, pivot);
                    // Update model segments with new paper.Segment instances
                    (s as PathShape).segments = scaledPath.segments.map(seg => new paper.Segment(
                        seg.point.clone(),
                        seg.handleIn ? seg.handleIn.clone() : undefined,
                        seg.handleOut ? seg.handleOut.clone() : undefined
                    ));
                    (s as PathShape).closed = scaledPath.closed;
                    // Cleanup temporary path
                    scaledPath.remove();
                    break;
                }
                case 'image': {
                    // Resize image: update center position and size
                    if (signX < 0) s.position.x = oB.x + oB.width - newW / 2;
                    else s.position.x = oB.x + newW / 2;
                    if (signY < 0) s.position.y = oB.y + oB.height - newH / 2;
                    else s.position.y = oB.y + newH / 2;
                    s.size.width = newW;
                    s.size.height = newH;
                    break;
                }
                case 'group': {
                    // Resize group by scaling the cloned group and recursively updating nested children
                    const pivot = new paper.Point(
                        signX > 0 ? oB.left : oB.right,
                        signY > 0 ? oB.top : oB.bottom
                    );
                    const groupClone = this.initialPaperGroup!.clone({ insert: false }) as paper.Group;
                    groupClone.scale(kx, ky, pivot);
                    this.commitResizedGroup(groupClone, s as GroupShape);
                    groupClone.remove();
                    break;
                }
            }
        });
    }

    private updateResizedShapesMultiple(p: paper.Point): void {
        const oBs = this.initialBounds!;
        const dx = p.x - this.resizeOrigin!.x;
        const dy = p.y - this.resizeOrigin!.y;
        const signX = (this.activeHandle === 'ne' || this.activeHandle === 'se') ? 1 : -1;
        const signY = (this.activeHandle === 'se' || this.activeHandle === 'sw') ? 1 : -1;
        // Compute overall scale
        const newW = Math.max(10, oBs.width + dx * signX);
        const newH = Math.max(10, oBs.height + dy * signY);
        const kx = newW / oBs.width;
        const ky = newH / oBs.height;
        const pivot = new paper.Point(
            signX > 0 ? oBs.left : oBs.right,
            signY > 0 ? oBs.top : oBs.bottom
        );
        this.store.updateShapes(shapes => {
            // For each cloned initial Paper item, scale and commit back to model
            this.initialPaperItemsMap.forEach((origClone, id) => {
                const s = shapes.find(sh => sh.id === id);
                if (!s) return;
                // Clone the original item and scale
                const scaled = origClone.clone({ insert: false });
                scaled.scale(kx, ky, pivot);
                // Commit based on shape type
                if (s.type === 'path') {
                    // Scale path: update model segments and closed state
                    const scaledPath = scaled as paper.Path;
                    (s as PathShape).segments = scaledPath.segments;
                    (s as PathShape).closed = scaledPath.closed;
                } else if (s.type === 'image') {
                    s.position = scaled.bounds.center;
                    s.size = scaled.bounds.size;
                } else if (s.type === 'group') {
                    // Scale group by recursively updating nested children
                    this.commitResizedGroup(scaled as paper.Group, s as GroupShape);
                }
                // Remove temporary scaled clone
                scaled.remove();
            });
        });
    }

    // Helper to recursively commit resizing for nested groups
    private commitResizedGroup(groupClone: paper.Group, groupModel: GroupShape): void {
        groupClone.children.forEach((childClone, idx) => {
            const childModel = groupModel.children[idx];
            if (!childModel) return;
            if (childModel.type === 'group') {
                this.commitResizedGroup(childClone as paper.Group, childModel as GroupShape);
            } else if (childModel.type === 'path') {
                const pathClone = childClone as paper.Path;
                (childModel as PathShape).segments = pathClone.segments;
                (childModel as PathShape).closed = pathClone.closed;
            } else if (childModel.type === 'image') {
                (childModel as ImageShape).position = childClone.bounds.center;
                (childModel as ImageShape).size = childClone.bounds.size;
            }
        });
    }

    // Handle comment moved event
    public onCommentMove(id: number, pos: { x: number; y: number }): void {
        const c = this.comments.find(c => c.id === id);
        if (c) { c.x = pos.x; c.y = pos.y; }
    }
    // Handle comment text edit or removal
    public onCommentEdit(id: number, newText: string): void {
        const idx = this.comments.findIndex(c => c.id === id);
        if (idx === -1) return;
        if (!newText.trim()) {
            // Remove empty comment
            this.comments.splice(idx, 1);
        } else {
            this.comments[idx].text = newText;
            this.comments[idx].editing = false;
        }
    }

    // Handle explicit deletion of comment
    public onCommentDelete(id: number): void {
        this.comments = this.comments.filter(c => c.id !== id);
    }

    // Handle end of drag: remove comment if cursor not on canvas at drop
    public onCommentDragEnd(eventData: { id: number; clientX: number; clientY: number }): void {
        const { id, clientX, clientY } = eventData;
        const idx = this.comments.findIndex(c => c.id === id);
        if (idx === -1) return;
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const inside =
            clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom;
        if (!inside) {
            this.comments.splice(idx, 1);
            console.log(`Deleted comment ${id} (dropped outside). Remaining IDs:`, this.comments.map(cm => cm.id));
        }
    }
} 
