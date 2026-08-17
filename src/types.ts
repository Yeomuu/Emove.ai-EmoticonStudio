export type RoutePath =
  | "/home"
  | "/character"
  | "/emoticon"
  | "/emoticon/edit"
  | "/mypage"
  | `/mypage/${string}`
  | "/input"
  | "/edit"
  | "/library"
  | `/library/${string}`
  | "/login"
  | "/profile"
  | "/community"
  | `/community/${string}`;

export type Emotion =
  | "happiness"
  | "joy"
  | "admiration"
  | "neutral"
  | "surprise"
  | "tension"
  | "sadness"
  | "anger"
  | "anxiety";

export type LayerKind = "background-effects" | "character" | "accent-effects" | "text";
export type TextBoxShape = "pill" | "rounded" | "caption";
export type TextFont = "Pretendard" | "Paperlogy";
export type CharacterStyleMode = "2D" | "3D";
export type MotionStyle = "smooth" | "dynamic" | "bouncy" | "subtle";
export type AccentEffect = "none" | "sparkles" | "hearts" | "stars" | "motion-lines" | "petals" | "speech-bubbles" | "clouds";
export type AnimationFormat = "APNG" | "GIF" | "WEBP";
export type ExaggerationTier = "minimal" | "emotional" | "full";
export type EmotionSource = "voice" | "action" | "expression";
export type EmotionProvider = "imentiv" | "local-voice-heuristic" | "mediapipe";

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

export interface EffectLayerStyle {
  blur: number;
  opacity: number;
}

export interface CharacterToken {
  id: string;
  version: number;
  name: string;
  ownerId: string | null;
  isDefault: boolean;
  favorite?: boolean;
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
  handGesture?: string;
  handConfidence?: number;
  bodyGesture?: string;
  bodyConfidence?: number;
  expression?: Emotion;
  analyzedEmotion?: Emotion;
  analyzedMotionIntensity?: number;
  analyzedExaggerationTier?: ExaggerationTier;
  emotionScores: Record<Emotion, number>;
  emotionSource?: EmotionSource;
  emotionProvider?: EmotionProvider;
  emotionConfidence?: number;
  emotionWarning?: string;
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
  exaggerationTier: ExaggerationTier;
  pose: string;
  coreEffect: string;
  effectColor: string;
  accentEffect?: AccentEffect;
  accentColor?: string;
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
  animationFormat?: AnimationFormat;
  animationStoragePath?: string;
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
  gifBlob?: Blob;
  animationBlob?: Blob;
  animationFormat?: AnimationFormat;
  characterToken: CharacterToken;
  behaviorCapture: Omit<BehaviorCapture, "videoBlob" | "audioBlob">;
  frameImages: string[];
  layers: EditorLayer[];
  layerTransforms: Record<LayerKind, LayerTransform>;
  frameLayerTransforms: Array<Record<LayerKind, LayerTransform>>;
  textStyle: { shape: TextBoxShape; font: TextFont; color?: string };
  effectSettings?: {
    background: EffectLayerStyle;
    accent: EffectLayerStyle;
  };
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
  pose?: {
    shoulderTilt: number;
    armSpread: number;
    bodyGesture?: string;
    bodyConfidence?: number;
    leftWrist?: { x: number; y: number; raised: boolean };
    rightWrist?: { x: number; y: number; raised: boolean };
  };
  hand?: { gesture: string; confidence: number };
  handDetected?: boolean;
  gesture?: string;
  source: "mediapipe" | "unavailable";
  diagnostics?: string;
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
  generateCharacterActionFrames(brief: MotionBrief, token: CharacterToken): Promise<string[]>;
}

export interface LibraryGroup {
  id: string;
  name: string;
  filter: "all" | "favorite" | Emotion;
  ownerId: "public";
  createdAt: string;
  updatedAt: string;
}

export interface QrExportPayload {
  stickerId: string;
  title: string;
  format: AnimationFormat;
  previewUrl: string;
  targetUrl: string;
  qrDataUrl: string;
}

export interface AuthUser {
  id: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  provider: "google" | "kakao" | "mock";
}
