export type RoutePath =
  | "/home"
  | "/character"
  | "/input"
  | "/edit"
  | "/library"
  | `/library/${string}`
  | "/login"
  | "/profile"
  | "/community"
  | `/community/${string}`;

export type Emotion =
  | "angry"
  | "disgusted"
  | "fearful"
  | "happy"
  | "neutral"
  | "other"
  | "sad"
  | "surprised"
  | "unknown";

export type LayerKind = "background-effects" | "character" | "accent-effects" | "text";
export type TextBoxShape = "pill" | "rounded" | "caption";
export type TextFont = "Pretendard" | "Paperlogy";
export type CharacterStyleMode = "2D" | "3D";
export type MotionStyle = "smooth" | "dynamic" | "bouncy" | "subtle";

export interface EditorLayer {
  id: LayerKind;
  label: string;
  description: string;
  visible: boolean;
  locked: boolean;
}

export interface LayerTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CharacterToken {
  id: string;
  version: number;
  name: string;
  ownerId: string | null;
  isDefault: boolean;
  sourceAsset: string;
  referenceImages: string[];
  styleMode: CharacterStyleMode;
  stylePreset: string;
  styleDescription: string;
  prompt: string;
  observableTraits: string[];
  personalityTags: string[];
  colors: Record<string, string>;
  fixedTraits: string[];
  doNotChange: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AudioFeatures {
  rms: number;
  peak: number;
  energy: number;
  capturedAt: string;
}

export interface BehaviorCapture {
  id: string;
  ownerId: string | null;
  videoBlob?: Blob;
  audioBlob?: Blob;
  poseSummary: string;
  gesture: string;
  expression?: Emotion;
  emotionScores: Record<Emotion, number>;
  sourceText: string;
  shortText: string;
  audio: AudioFeatures;
  createdAt: string;
}

export interface MotionBrief {
  sourceText: string;
  shortText: string;
  expressionEmotion: Emotion;
  emotion: Emotion;
  confidence: number;
  motionIntensity: number;
  pose: string;
  coreEffect: string;
  effectColor: string;
  duration: number;
  frameDelayMs: number;
  motionStyle: MotionStyle;
  characterTokenId: string;
}

export interface StickerItem {
  id: string;
  title: string;
  phrase: string;
  emotion: Emotion;
  image: string;
  animatedImage?: string;
  thumbnail?: string;
  gifStoragePath?: string;
  projectId?: string;
  group?: string;
  frameDelayMs?: number;
  color: string;
  favorite: boolean;
  ownerId: string | null;
  isDefault: boolean;
  isPublished: boolean;
  characterTokenId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmoticonProject {
  id: string;
  ownerId: string | null;
  sticker: StickerItem;
  gifBlob: Blob;
  characterToken: CharacterToken;
  behaviorCapture: Omit<BehaviorCapture, "videoBlob" | "audioBlob">;
  frameImages: string[];
  layers: EditorLayer[];
  layerTransforms: Record<LayerKind, LayerTransform>;
  frameLayerTransforms: Array<Record<LayerKind, LayerTransform>>;
  coreEffectImage?: string | null;
  textStyle: { shape: TextBoxShape; font: TextFont };
  motionBrief: MotionBrief;
  createdAt: string;
  updatedAt: string;
}

export interface VisionMetrics {
  face?: {
    smile: number;
    eyeOpenness: number;
    mouthOpen: number;
    browRaise: number;
    expression: Emotion;
    confidence: number;
  };
  pose?: { shoulderTilt: number; armSpread: number };
  gesture?: string;
  source: "mediapipe" | "unavailable";
}

export interface TranscriptionResult {
  sourceText: string;
  shortText: string;
}

export interface GeneratedCharacterResult {
  imageUrl: string;
  imageUrls?: string[];
  token: CharacterToken;
  revisedPrompt?: string;
  revisedPrompts?: string[];
}

export interface OpenAIProvider {
  readonly mode: "openai";
  transcribe(audio: Blob): Promise<TranscriptionResult>;
  generateCharacter(token: CharacterToken): Promise<GeneratedCharacterResult>;
  generateCharacterFrames(brief: MotionBrief, token: CharacterToken): Promise<string[]>;
  generateCoreEffect(brief: MotionBrief): Promise<string | null>;
}

export interface AuthUser {
  id: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  provider: "google" | "kakao" | "mock";
}
