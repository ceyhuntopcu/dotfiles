export type DisplayModel = {
    provider?: string;
    id?: string;
};

export class ModelDisplayState {
    model: DisplayModel | undefined;
    thinkingLevel: string | undefined;
    contextPercent: number | null;
    contextWindow: number;
    private readonly requestRender: () => void;

    constructor(
        model: DisplayModel | undefined,
        thinkingLevel: string | undefined,
        requestRender: () => void,
    ) {
        this.model = model;
        this.thinkingLevel = thinkingLevel;
        this.requestRender = requestRender;
        this.contextPercent = null;
        this.contextWindow = 0;
    }

    selectModel(model: DisplayModel, thinkingLevel: string | undefined): void {
        this.model = model;
        this.thinkingLevel = thinkingLevel;
        this.requestRender();
    }

    /**
     * Display-only context usage. Render is requested only on a real change so
     * transcript-driven context updates cannot cause a render loop.
     */
    selectContext(percent: number | null, contextWindow: number): void {
        if (this.contextPercent === percent && this.contextWindow === contextWindow) return;
        this.contextPercent = percent;
        this.contextWindow = contextWindow;
        this.requestRender();
    }

    selectThinkingLevel(thinkingLevel: string | undefined): void {
        this.thinkingLevel = thinkingLevel;
        this.requestRender();
    }
}
