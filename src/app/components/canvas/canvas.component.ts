import { AfterViewInit, Component, ElementRef, HostListener, Input, Output, ViewChild, OnDestroy, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';
import paper from 'paper';
import { Tool } from '../../models/tool.enum';
import { Shape, PathShape, RectangleShape, EllipseShape, TextShape, ImageShape, GroupShape, ShapeStyle } from '../../models/shape.model';
import { CanvasStore } from '../../services/canvas.store';
import { ShapeRendererService } from '../../services/shape-renderer.service';
import { SelectionRendererService, BoundingBoxConfig } from '../../services/selection-renderer.service';

interface PaperItemWithId extends paper.Item {
    shapeId?: number;
}

@Component({
    selector: 'app-canvas',
    standalone: true,
    templateUrl: './canvas.component.html',
    styleUrls: ['./canvas.component.scss'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
    @Input() tool: Tool = Tool.Move;
    @Output() toolChange = new EventEmitter<Tool>();

    @ViewChild('canvas', { static: true })
    private canvasRef!: ElementRef<HTMLCanvasElement>;

    // Public wrapper methods for DOM events
    public onMouseDown(event: MouseEvent): void {
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

    // Bounding box style configuration
    private readonly boundingBoxConfig = {
        padding: 0,
        strokeColor: '#0c8ce9',
        strokeWidth: 1,
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

    constructor(private store: CanvasStore, private renderer: ShapeRendererService, private selectionRenderer: SelectionRendererService) {}

    ngAfterViewInit(): void {
        console.log('Initializing Paper.js canvas');
        // Setup Paper.js
        const canvas = this.canvasRef.nativeElement;
        paper.setup(canvas);
        this.project = paper.project;

        // Set canvas size
        this.project.view.viewSize = new paper.Size(
            canvas.offsetWidth,
            canvas.offsetHeight
        );
        console.log('Canvas size set:', { 
            width: canvas.offsetWidth, 
            height: canvas.offsetHeight 
        });

        // Initialize moveOffset after Paper.js is set up
        this.moveOffset = new paper.Point(0, 0);

        // Create layers for different purposes
        this.mainLayer = new paper.Layer();
        this.mainLayer.name = 'mainLayer';
        this.mainLayer.activate();
        console.log('Main layer created and activated');

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
        console.log('handleMouseDown at', event.point);
        const point = event.point;
        this.dragStartPoint = point;
        this.lastMousePoint = point;

        console.log('selectionLayer items data handles:', this.selectionLayer.children.map(ch => ch.data));
        // Check for click on a resize handle path in selectionLayer
        const handleHit = this.project.hitTest(point, {
            fill: true,
            stroke: true,
            tolerance: this.boundingBoxConfig.handleSize,
            match: (res: paper.HitResult) => res.item.layer === this.selectionLayer && (res.item.data as any)?.handle
        });
        if (handleHit?.item) {
            const handleName = (handleHit.item.data as any).handle as 'nw' | 'ne' | 'se' | 'sw';
            console.log('Clicked on handle item', handleName);
            this.activeHandle = handleName;
            this.resizingItem = Array.from(this.selectedItems)[0];
            // Capture initial bounds and shape copy for resize
            this.initialBounds = this.resizingItem.bounds.clone();
            const id = this.resizingItem.shapeId;
            if (id != null) {
                const shape = this.store.shapes$.value.find(s => s.id === id);
                this.initialShapeCopy = shape ? JSON.parse(JSON.stringify(shape)) as Shape : null;
            }
            this.resizeOrigin = point;
            this.updateCanvas();
            return;
        }

        if (this.tool === Tool.Move) {
            let hitSelectedItem = false;
            // Check if clicked within selected item's bounding box for move
            for (const selItem of this.selectedItems) {
                const expandedBounds = selItem.bounds.expand(this.boundingBoxConfig.padding);
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
                    break;
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
                        // Update store selection
                        if (event.modifiers.shift) {
                            this.store.toggle(item.shapeId);
                        } else {
                            this.store.select(item.shapeId);
                        }
                        this.updateCanvas();
                    } else {
                        // Fallback: bounding box click detection
                        let boxHit: PaperItemWithId | null = null;
                        for (let i = this.mainLayer.children.length - 1; i >= 0; i--) {
                            const child = this.mainLayer.children[i] as PaperItemWithId;
                            if (child.bounds.contains(point)) {
                                boxHit = child;
                                break;
                            }
                        }
                        if (boxHit?.shapeId) {
                            // Select via box hit
                            if (!event.modifiers.shift) this.selectedItems.clear();
                            this.selectedItems.add(boxHit);
                            this.movingItem = boxHit;
                            this.moveOffset = point.subtract(boxHit.position);
                            this.initialPositions.clear();
                            this.selectedItems.forEach(it => it.shapeId != null && this.initialPositions.set(it.shapeId, it.position.clone()));
                            if (event.modifiers.shift) this.store.toggle(boxHit.shapeId);
                            else this.store.select(boxHit.shapeId);
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
                    }
                } else {
                    // Fallback if no hitResult: bounding box click
                    let boxHit: PaperItemWithId | null = null;
                    for (let i = this.mainLayer.children.length - 1; i >= 0; i--) {
                        const child = this.mainLayer.children[i] as PaperItemWithId;
                        if (child.bounds.contains(point)) {
                            boxHit = child;
                            break;
                        }
                    }
                    if (boxHit?.shapeId) {
                        if (!event.modifiers.shift) this.selectedItems.clear();
                        this.selectedItems.add(boxHit);
                        this.movingItem = boxHit;
                        this.moveOffset = point.subtract(boxHit.position);
                        this.initialPositions.clear();
                        this.selectedItems.forEach(it => it.shapeId != null && this.initialPositions.set(it.shapeId, it.position.clone()));
                        if (event.modifiers.shift) this.store.toggle(boxHit.shapeId);
                        else this.store.select(boxHit.shapeId);
                        this.updateCanvas();
                    } else {
                        this.selectedItems.clear();
                        this.store.clearSelection();
                        this.marqueeActive = true;
                        this.marqueeStart = point;
                        this.marqueeEnd = point;
                        this.updateCanvas();
                    }
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
                const strokeColor = null; // no stroke preview for rect
                const fillColor = style.fillEnabled && style.fill && typeof style.fill === 'string'
                    ? new paper.Color(style.fill)
                    : null;

                // Create rectangle with minimal size 1x1
                const rect = new paper.Rectangle(point, point.add(new paper.Point(1, 1)));
                this.currentPath = new paper.Path.Rectangle({
                    rectangle: rect,
                    strokeColor,
                    strokeWidth: style.strokeWidth || 2,
                    fillColor
                });
                this.currentPath.data = { type: 'rectangle' };
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
                this.currentPath.data = { type: 'ellipse' };
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
        console.log('handleMouseDrag called, activeHandle:', this.activeHandle, 'movingItem:', this.movingItem?.shapeId, 'resizingItem:', this.resizingItem?.shapeId, 'delta:', delta, 'point:', point);

        // Resize: update store shapes based on initial copy and origin
        if (this.resizingItem && this.activeHandle && this.initialBounds && this.initialShapeCopy && this.resizeOrigin) {
            console.log('Resizing in progress', this.activeHandle);
            this.updateResizedShape(point);
            // Re-render all shapes
            this.updateCanvas();
            return;
        }

        // Marquee selection update
        if (this.marqueeActive && this.marqueeStart) {
            this.marqueeEnd = point;
            this.updateCanvas();
            return;
        }

        // Move preview: adjust item positions visually based on initialPositions
        if (this.movingItem && this.dragStartPoint) {
            console.log('Moving item in handleMouseDrag', this.movingItem.shapeId, 'delta from start:', event.point.subtract(this.dragStartPoint));
            const deltaFromStart = event.point.subtract(this.dragStartPoint);
            this.selectedItems.forEach(item => {
                const id = item.shapeId;
                const start = id != null ? this.initialPositions.get(id) : null;
                if (start) {
                    item.position = start.add(deltaFromStart);
                }
            });
            this.updateSelection();
            return;
        }

        if (this.currentPath) {
            switch (this.tool) {
                case Tool.Pen:
                    this.currentPath.add(point);
                    this.currentPath.selected = false;
                    this.updateCanvas(); // Превью pen tool
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
                    // Минимальный размер 1x1
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
        // Always detect hovered shape underneath cursor
        const hitResult = this.project.hitTest(event.point, {
            fill: true,
            stroke: true,
            segments: true,
            pixel: true,
            tolerance: 5,
            match: (result: paper.HitResult) => result.item.layer === this.mainLayer
        });
        if (hitResult?.item) {
            // Find top-level item with shapeId for hover
            let item = hitResult.item as PaperItemWithId;
            while (item && item.shapeId == null) {
                item = item.parent as PaperItemWithId;
            }
            this.hoveredItem = item;
        } else {
            this.hoveredItem = null;
        }
        this.updateCanvas();
    }

    private handleMouseUp(event: paper.ToolEvent): void {
        if (this.marqueeActive && this.marqueeStart && this.marqueeEnd) {
            const x1 = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
            const y1 = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
            const x2 = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
            const y2 = Math.max(this.marqueeStart.y, this.marqueeEnd.y);
            if (x2 - x1 > 2 || y2 - y1 > 2) {
                // Выделяем все объекты, чьи bounds пересекаются с рамкой
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

        // Commit moving changes to the store before clearing state
        if (this.movingItem) {
            this.store.updateShapes(shapes => {
                this.selectedItems.forEach(item => {
                    const id = item.shapeId;
                    if (id != null) {
                        const shape = shapes.find(s => s.id === id);
                        if (shape) {
                            const bounds = item.bounds;
                            if (shape.type === 'rectangle') {
                                (shape as RectangleShape).topLeft = new paper.Point(bounds.x, bounds.y);
                                (shape as RectangleShape).size = new paper.Size(bounds.width, bounds.height);
                            } else if (shape.type === 'ellipse') {
                                (shape as EllipseShape).center = bounds.center;
                                (shape as EllipseShape).radius = new paper.Size(bounds.width / 2, bounds.height / 2);
                            } else if (shape.type === 'path') {
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
                                    if (childData.type === 'rectangle') {
                                        (childData as RectangleShape).topLeft = new paper.Point(bounds.x, bounds.y);
                                        (childData as RectangleShape).size = new paper.Size(bounds.width, bounds.height);
                                    } else if (childData.type === 'ellipse') {
                                        (childData as EllipseShape).center = bounds.center;
                                        (childData as EllipseShape).radius = new paper.Size(bounds.width / 2, bounds.height / 2);
                                    } else if (childData.type === 'path') {
                                        const pathItem = childItem as paper.Path;
                                        (childData as PathShape).segments = pathItem.segments;
                                        (childData as PathShape).closed = pathItem.closed;
                                    } else if (childData.type === 'image') {
                                        (childData as ImageShape).position = childItem.position as paper.Point;
                                        (childData as ImageShape).size = new paper.Size(bounds.width, bounds.height);
                                    }
                                });
                            }
                        }
                    }
                });
            });
        }
        this.movingItem = null;
        this.resizingItem = null;
        this.activeHandle = null;

        // Reset tool to Move after drawing
        this.tool = Tool.Move;
        this.toolChange.emit(this.tool);

        // Ensure selection is up to date and re-render canvas
        this.updateSelection();
        this.updateCanvas();
        // Clear initial positions map after move
        this.initialPositions.clear();
        // Clear resize state
        this.initialShapeCopy = null;
        this.resizeOrigin = null;
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

        // Render selection visuals
        this.selectionRenderer.renderSelection(this.selectionLayer, this.selectedItems, this.boundingBoxConfig as BoundingBoxConfig);

        // Render marquee selection
        if (this.marqueeActive && this.marqueeStart && this.marqueeEnd) {
            this.selectionRenderer.renderMarquee(this.guideLayer, this.marqueeStart, this.marqueeEnd);
        }

        // Render hover outline only when Move tool active
        if (this.tool === Tool.Move) {
            this.selectionRenderer.renderHover(this.guideLayer, this.hoveredItem, this.boundingBoxConfig as BoundingBoxConfig);
        }

        // --- Preview for currentPath (pen, rect, ellipse) ---
        if (this.currentPath) {
            // Re-add preview path after layer cleared
            this.mainLayer.addChild(this.currentPath);
            this.currentPath.bringToFront();
            this.currentPath.selected = false;
        }
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

        console.log('Converting path to shape with style:', style);

        // Check the current tool to determine shape type
        if (this.tool === Tool.Rect || path.data?.type === 'rectangle') {
            console.log('Converting Rectangle');
            const shape = {
                id,
                type: 'rectangle',
                topLeft: { x: path.bounds.x, y: path.bounds.y },
                size: { width: path.bounds.width, height: path.bounds.height },
                style
            } as RectangleShape;
            console.log('Created rectangle shape:', shape);
            return shape;
        } else if (this.tool === Tool.Ellipse || path.data?.type === 'ellipse') {
            console.log('Converting Ellipse');
            const shape = {
                id,
                type: 'ellipse',
                center: { x: path.bounds.center.x, y: path.bounds.center.y },
                radius: { width: path.bounds.width / 2, height: path.bounds.height / 2 },
                style
            } as EllipseShape;
            console.log('Created ellipse shape:', shape);
            return shape;
        }

        // Default to path
        console.log('Converting Path');
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
        console.log('Created path shape:', shape);
        return shape;
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyDown(event: KeyboardEvent): void {
        // Ignore Delete/Backspace when focus is on an input or editable element
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !event.repeat) {
            // Удаляем выделенные объекты
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
                console.log('Shapes updated in store, updating canvas');
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
                console.log('Comment visibility updated');
                this.updateCanvas();
            }),
            this.store.activeStyle$.subscribe(() => {
                console.log('Active style changed, updating canvas');
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
                case 'rectangle': {
                    if (signX < 0) s.topLeft.x = oB.x + oB.width - newW;
                    else s.topLeft.x = oB.x;
                    s.size.width = newW;
                    if (signY < 0) s.topLeft.y = oB.y + oB.height - newH;
                    else s.topLeft.y = oB.y;
                    s.size.height = newH;
                    break;
                }
                case 'ellipse': {
                    if (signX < 0) s.center.x = oB.x + oB.width - newW / 2;
                    else s.center.x = oB.x + newW / 2;
                    s.radius.width = newW / 2;
                    if (signY < 0) s.center.y = oB.y + oB.height - newH / 2;
                    else s.center.y = oB.y + newH / 2;
                    s.radius.height = newH / 2;
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
                case 'path': {
                    const pathOrig = orig.paperObject as unknown as paper.Path;
                    const pathS = s.paperObject as unknown as paper.Path;
                
                    // Determine pivot corner (opposite handle)
                    const pivot = new paper.Point(
                        signX > 0 ? oB.left : oB.right,
                        signY > 0 ? oB.top : oB.bottom
                    );
                
                    // Scale the cloned path
                    const scaledPath = pathOrig.clone();
                    scaledPath.scale(kx, ky, pivot);
                
                    // Assign proper Segment instances to match type
                    pathS.segments = scaledPath.segments.map(seg => new paper.Segment(
                        seg.point.clone(),
                        seg.handleIn ? seg.handleIn.clone() : undefined,
                        seg.handleOut ? seg.handleOut.clone() : undefined
                    ));
                    pathS.closed = scaledPath.closed;
                
                    // Cleanup temporary path
                    scaledPath.remove();
                    break;
                }
            }
        });
    }
} 
