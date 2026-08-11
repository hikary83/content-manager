"use client";

import { ChangeEvent, useState } from "react";
import { FlowPromptStudio, PostProductionPackage, type ConceptId, type FlowProject } from "./components/FlowPromptStudio";
import { ProductDiscovery, type DiscoveryProduct } from "./components/ProductDiscovery";
import { ProjectLibrary, PublishingManager, type SavedAsset, type SavedProject } from "./components/ProjectWorkspace";

const tones = ["트렌디", "친근한", "전문적인", "유쾌한"];
const concepts: Array<{ id: ConceptId; icon: string; name: string; description: string; tag?: string }> = [
  { id: "problem", icon: "!", name: "문제 해결형", description: "불편을 먼저 보여주고 상품으로 해결", tag: "추천" },
  { id: "review", icon: "♡", name: "찐후기형", description: "친한 사람이 알려주는 자연스러운 리뷰" },
  { id: "premium", icon: "✦", name: "감성 광고형", description: "빛·질감·무드로 구매 욕구를 자극" },
  { id: "demo", icon: "▶", name: "사용 시연형", description: "사용법과 효과를 눈앞에서 명확하게" },
];

const wizardSteps = [
  { number: "01", short: "상품 찾기", title: "팔릴 상품 찾기" },
  { number: "02", short: "상품 선택", title: "상품 정보 확인" },
  { number: "03", short: "콘셉트 선택", title: "쇼츠 콘셉트 선택" },
  { number: "04", short: "Flow 제작안", title: "콘티·Flow 프롬프트" },
  { number: "05", short: "게시 준비", title: "영상·게시 관리" },
];

type ReferenceImage = {
  id: string;
  name: string;
  dataUrl: string;
};

type PersistedProjectData = {
  productUrl: string;
  productName: string;
  normalPrice: string;
  salePrice: string;
  benefit: string;
  productImage: string | null;
  fileName: string;
  productImages?: ReferenceImage[];
  referenceImages: ReferenceImage[];
  concept: ConceptId;
  tone: string;
  hook: string;
  flowProject: FlowProject | null;
  notes: string;
};

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function readReferenceFile(file: File): Promise<ReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return reject(new Error("이미지를 읽지 못했어요."));
      resolve({ id: `${file.name}-${file.lastModified}-${Math.random()}`, name: file.name, dataUrl: reader.result });
    });
    reader.addEventListener("error", () => reject(new Error("이미지를 읽지 못했어요.")));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [tone, setTone] = useState("트렌디");
  const [concept, setConcept] = useState<ConceptId>("problem");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("상품 이미지를 올려주세요");
  const [productImages, setProductImages] = useState<ReferenceImage[]>([]);
  const [productImagesLoading, setProductImagesLoading] = useState(false);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [referenceMessage, setReferenceMessage] = useState("");
  const [projectRevision, setProjectRevision] = useState(0);
  const [hook, setHook] = useState("이거, 왜 이제 알았지?");
  const [productStarted, setProductStarted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productUrl, setProductUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [normalPrice, setNormalPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [benefit, setBenefit] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [flowProject, setFlowProject] = useState<FlowProject | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState("draft");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [infoqUrl, setInfoqUrl] = useState("");
  const [publishUrl, setPublishUrl] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const [savedAssets, setSavedAssets] = useState<SavedAsset[]>([]);
  const [savingProject, setSavingProject] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");

  const productReady = productName.trim().length >= 2 && benefit.trim().length >= 5;
  const resetProject = () => {
    setFlowProject(null);
    setProjectRevision((value) => value + 1);
  };

  async function loadSavedProjects() {
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json() as { projects?: SavedProject[]; error?: string };
      if (!response.ok) throw new Error(data.error || "프로젝트를 불러오지 못했어요.");
      setSavedProjects(data.projects ?? []);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "프로젝트를 불러오지 못했어요.");
    } finally {
      setLibraryLoading(false);
    }
  }

  const openLibrary = () => {
    setShowLibrary(true);
    void loadSavedProjects();
  };

  function buildProjectData(productImage = uploadedImage, references = referenceImages, gallery = productImages): PersistedProjectData {
    return {
      productUrl,
      productName,
      normalPrice,
      salePrice,
      benefit,
      productImage,
      fileName,
      productImages: gallery,
      referenceImages: references,
      concept,
      tone,
      hook,
      flowProject,
      notes,
    };
  }

  function projectRequestBody(data: PersistedProjectData, status = projectStatus) {
    const conceptLabel = concepts.find((item) => item.id === concept)?.name ?? "쇼츠";
    return {
      title: `${productName} · ${conceptLabel}`,
      productName,
      status,
      data,
      coupangUrl: affiliateUrl,
      infoqUrl,
      publishUrl,
      publishedAt: publishedDate ? new Date(`${publishedDate}T00:00:00+09:00`).getTime() : null,
    };
  }

  async function uploadProjectAsset(activeProjectId: string, file: File, kind: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    const response = await fetch(`/api/projects/${activeProjectId}/assets`, { method: "POST", body: form });
    const data = await response.json() as { asset?: SavedAsset & { url?: string }; error?: string };
    if (!response.ok || !data.asset) throw new Error(data.error || "파일을 저장하지 못했어요.");
    return { ...data.asset, url: data.asset.url ?? `/api/projects/${activeProjectId}/assets/${data.asset.id}` };
  }

  async function dataUrlToFile(dataUrl: string, name: string) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], name || "reference-image.png", { type: blob.type || "image/png" });
  }

  async function refreshAssets(activeProjectId: string) {
    const response = await fetch(`/api/projects/${activeProjectId}/assets`, { cache: "no-store" });
    const data = await response.json() as { assets?: SavedAsset[]; error?: string };
    if (!response.ok) throw new Error(data.error || "첨부 파일을 불러오지 못했어요.");
    setSavedAssets((data.assets ?? []).map((asset) => ({ ...asset, url: `/api/projects/${activeProjectId}/assets/${asset.id}` })));
  }

  const saveCurrentProject = async (options: { status?: string; successMessage?: string } = {}) => {
    if (!productReady) {
      setSaveMessage({ kind: "error", text: "상품명과 핵심 소구점을 먼저 완성해주세요." });
      return false;
    }
    setSavingProject(true);
    setSaveMessage(null);
    try {
      let activeProjectId = projectId;
      const safeProductImage = uploadedImage?.startsWith("data:") ? null : uploadedImage;
      const safeProductImages = productImages.map((image) => ({ ...image, dataUrl: image.dataUrl.startsWith("data:") ? "" : image.dataUrl }));
      const safeReferences = referenceImages.map((image) => ({ ...image, dataUrl: image.dataUrl.startsWith("data:") ? "" : image.dataUrl }));
      const saveStatus = options.status ?? projectStatus;
      const initialBody = projectRequestBody(buildProjectData(safeProductImage, safeReferences, safeProductImages), saveStatus);
      const initialResponse = await fetch(activeProjectId ? `/api/projects/${activeProjectId}` : "/api/projects", {
        method: activeProjectId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(initialBody),
      });
      const initialData = await initialResponse.json() as { project?: SavedProject; error?: string };
      if (!initialResponse.ok || !initialData.project) throw new Error(initialData.error || "프로젝트를 저장하지 못했어요.");
      activeProjectId = initialData.project.id;
      setProjectId(activeProjectId);

      let persistedProductImage = uploadedImage;
      const persistedProductImages = [...productImages];
      const persistedReferences = [...referenceImages];
      if (uploadedImage?.startsWith("data:")) {
        const asset = await uploadProjectAsset(activeProjectId, await dataUrlToFile(uploadedImage, fileName), "product");
        persistedProductImage = asset.url ?? null;
        for (let index = 0; index < persistedProductImages.length; index += 1) {
          if (persistedProductImages[index].dataUrl === uploadedImage) {
            persistedProductImages[index] = { ...persistedProductImages[index], id: asset.id, dataUrl: asset.url ?? "" };
          }
        }
      }
      for (let index = 0; index < persistedProductImages.length; index += 1) {
        const image = persistedProductImages[index];
        if (!image.dataUrl.startsWith("data:")) continue;
        const asset = await uploadProjectAsset(activeProjectId, await dataUrlToFile(image.dataUrl, image.name), "product-reference");
        persistedProductImages[index] = { ...image, id: asset.id, dataUrl: asset.url ?? "" };
      }
      for (let index = 0; index < persistedReferences.length; index += 1) {
        const reference = persistedReferences[index];
        if (!reference.dataUrl.startsWith("data:")) continue;
        const asset = await uploadProjectAsset(activeProjectId, await dataUrlToFile(reference.dataUrl, reference.name), "reference");
        persistedReferences[index] = { ...reference, id: asset.id, dataUrl: asset.url ?? "" };
      }
      if (pendingVideo) {
        await uploadProjectAsset(activeProjectId, pendingVideo, "video");
        setPendingVideo(null);
      }

      const finalBody = projectRequestBody(buildProjectData(persistedProductImage, persistedReferences, persistedProductImages), saveStatus);
      const finalResponse = await fetch(`/api/projects/${activeProjectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(finalBody),
      });
      const finalData = await finalResponse.json() as { project?: SavedProject; error?: string };
      if (!finalResponse.ok || !finalData.project) throw new Error(finalData.error || "프로젝트 정보를 마무리하지 못했어요.");
      setUploadedImage(persistedProductImage);
      setProductImages(persistedProductImages);
      setReferenceImages(persistedReferences);
      setProjectStatus(saveStatus);
      await refreshAssets(activeProjectId);
      setSaveMessage({ kind: "success", text: options.successMessage ?? "프로젝트와 첨부 파일을 저장했어요. 다음 접속에서도 이어서 작업할 수 있어요." });
      await loadSavedProjects();
      return true;
    } catch (error) {
      setSaveMessage({ kind: "error", text: error instanceof Error ? error.message : "프로젝트를 저장하지 못했어요." });
      return false;
    } finally {
      setSavingProject(false);
    }
  };

  const openSavedProject = async (summary: SavedProject) => {
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const response = await fetch(`/api/projects/${summary.id}`, { cache: "no-store" });
      const result = await response.json() as { project?: SavedProject; assets?: SavedAsset[]; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error || "프로젝트를 열지 못했어요.");
      const data = result.project.data as Partial<PersistedProjectData>;
      setProjectId(result.project.id);
      setProductStarted(true);
      setSelectedProductId(null);
      setProductUrl(data.productUrl ?? "");
      setProductName(data.productName ?? result.project.productName);
      setNormalPrice(data.normalPrice ?? "");
      setSalePrice(data.salePrice ?? "");
      setBenefit(data.benefit ?? "");
      setUploadedImage(data.productImage ?? null);
      setFileName(data.fileName ?? "저장된 상품 이미지");
      setProductImages(Array.isArray(data.productImages) && data.productImages.length > 0
        ? data.productImages
        : data.productImage
          ? [{ id: "saved-product-main", name: data.fileName ?? "상품 대표 이미지", dataUrl: data.productImage }]
          : []);
      setReferenceImages(Array.isArray(data.referenceImages) ? data.referenceImages : []);
      setConcept(data.concept ?? "problem");
      setTone(data.tone ?? "트렌디");
      setHook(data.hook ?? "이거, 왜 이제 알았지?");
      setFlowProject(data.flowProject ?? null);
      setNotes(data.notes ?? "");
      setProjectStatus(result.project.status);
      setAffiliateUrl(result.project.coupangUrl ?? "");
      setInfoqUrl(result.project.infoqUrl ?? "");
      setPublishUrl(result.project.publishUrl ?? "");
      setPublishedDate(result.project.publishedAt ? new Date(result.project.publishedAt).toISOString().slice(0, 10) : "");
      setSavedAssets((result.assets ?? []).map((asset) => ({ ...asset, url: `/api/projects/${result.project!.id}/assets/${asset.id}` })));
      setPendingVideo(null);
      setSaveMessage({ kind: "success", text: "저장된 프로젝트를 불러왔어요." });
      const resumeStep = data.flowProject ? 4 : 3;
      setCurrentStep(resumeStep);
      setFurthestStep(resumeStep);
      setProjectRevision((value) => value + 1);
      setShowLibrary(false);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "프로젝트를 열지 못했어요.");
    } finally {
      setLibraryLoading(false);
    }
  };

  const deleteSavedProject = async (project: SavedProject) => {
    if (!window.confirm(`“${project.title}” 프로젝트와 첨부 파일을 삭제할까요?`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setLibraryError(data.error || "프로젝트를 삭제하지 못했어요.");
      return;
    }
    if (projectId === project.id) setProjectId(null);
    await loadSavedProjects();
  };

  const deleteSavedAsset = async (asset: SavedAsset) => {
    if (!window.confirm(`“${asset.fileName}” 파일을 삭제할까요?`)) return;
    const response = await fetch(`/api/projects/${asset.projectId}/assets/${asset.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setSaveMessage({ kind: "error", text: data.error || "파일을 삭제하지 못했어요." });
      return;
    }
    setSavedAssets((assets) => assets.filter((item) => item.id !== asset.id));
    setSaveMessage({ kind: "success", text: "첨부 파일을 삭제했어요." });
  };

  const isStepLocked = (step: number) => {
    if (step > furthestStep + 1) return true;
    if (step >= 1 && !productStarted) return true;
    if (step >= 2 && !productReady) return true;
    if (step >= 4 && !flowProject) return true;
    return false;
  };

  const goToStep = (nextStep: number) => {
    if (nextStep < 0 || nextStep > 4) return;
    if (isStepLocked(nextStep)) return;
    setCurrentStep(nextStep);
    setFurthestStep((value) => Math.max(value, nextStep));
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const savePlanningAndContinue = async () => {
    if (!flowProject) {
      setSaveMessage({ kind: "error", text: "먼저 Flow 제작안을 만들어주세요." });
      document.getElementById("flow-prompts")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const saved = await saveCurrentProject({
      status: "planning",
      successMessage: "콘티와 Flow 프롬프트까지 저장했어요. 이제 영상 제작과 게시 준비를 진행하세요.",
    });
    if (saved) goToStep(4);
  };

  const startManualEntry = () => {
    setProjectId(null);
    setSavedAssets([]);
    setProjectStatus("draft");
    setSaveMessage(null);
    setProductStarted(true);
    setSelectedProductId(null);
    setImportStatus({ kind: "success", message: "상품 링크나 정보를 직접 입력해주세요." });
    setCurrentStep(1);
    setFurthestStep((value) => Math.max(value, 1));
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setImportStatus({ kind: "error", message: "상품 이미지는 8MB 이하로 올려주세요." });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        const nextImage = { id: `product-main-${file.lastModified}-${Math.random()}`, name: file.name, dataUrl: reader.result };
        setUploadedImage(reader.result);
        setProductImages((current) => {
          const additional = current[0]?.dataUrl === uploadedImage ? current.slice(1) : current;
          return [nextImage, ...additional.filter((image) => image.dataUrl !== reader.result)].slice(0, 5);
        });
      }
    });
    reader.readAsDataURL(file);
    setFileName(file.name);
    setImportStatus(null);
    resetProject();
  };

  const handleProductImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const available = 5 - productImages.length;
    const accepted = files.filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, available);
    if (accepted.length === 0) {
      setReferenceMessage(productImages.length >= 5 ? "상품 이미지는 최대 5장까지 사용할 수 있어요." : "JPG·PNG·WEBP 이미지를 장당 8MB 이하로 올려주세요.");
      return;
    }
    try {
      const loaded = await Promise.all(accepted.map(readReferenceFile));
      setProductImages((current) => [...current, ...loaded].slice(0, 5));
      if (!uploadedImage && loaded[0]) {
        setUploadedImage(loaded[0].dataUrl);
        setFileName(loaded[0].name);
      }
      setReferenceMessage(`${loaded.length}장의 상품 이미지를 추가했어요. Flow Ingredients에 함께 넣어주세요.`);
      resetProject();
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "상품 이미지를 읽지 못했어요.");
    }
  };

  const makePrimaryProductImage = (id: string) => {
    const target = productImages.find((image) => image.id === id);
    if (!target) return;
    setUploadedImage(target.dataUrl);
    setFileName(target.name);
    setProductImages([target, ...productImages.filter((image) => image.id !== id)]);
    setReferenceMessage("대표 상품 이미지를 변경했어요.");
    resetProject();
  };

  const removeProductImage = (id: string) => {
    const next = productImages.filter((image) => image.id !== id);
    if (productImages[0]?.id === id) {
      setUploadedImage(next[0]?.dataUrl ?? null);
      setFileName(next[0]?.name ?? "상품 이미지를 올려주세요");
    }
    setProductImages(next);
    setReferenceMessage("상품 이미지를 제거했어요.");
    resetProject();
  };

  const downloadProductImage = async (image: ReferenceImage, index: number) => {
    try {
      const source = /^https?:\/\//i.test(image.dataUrl)
        ? `/api/image-download?url=${encodeURIComponent(image.dataUrl)}&name=${encodeURIComponent(image.name)}`
        : image.dataUrl;
      const response = await fetch(source);
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "상품 이미지를 내려받지 못했어요.");
      }
      const blob = await response.blob();
      const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : blob.type.includes("gif") ? "gif" : "jpg";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `HIKARY-${productName.replace(/[^\p{L}\p{N}]+/gu, "-") || "product"}-${String(index + 1).padStart(2, "0")}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "상품 이미지를 내려받지 못했어요.");
    }
  };

  const downloadAllProductImages = async () => {
    setReferenceMessage(`${productImages.length}장의 상품 이미지 다운로드를 시작했어요.`);
    for (let index = 0; index < productImages.length; index += 1) {
      await downloadProductImage(productImages[index], index);
    }
  };

  const refreshProductImages = async () => {
    if (!productUrl.trim()) {
      setReferenceMessage("상품 페이지 주소를 입력하면 사진을 더 찾아볼 수 있어요.");
      return;
    }
    setProductImagesLoading(true);
    setReferenceMessage("");
    try {
      const response = await fetch("/api/import-product", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const data = await response.json() as { error?: string; image?: string; images?: string[] };
      if (!response.ok) throw new Error(data.error || "상품 사진을 불러오지 못했어요.");
      const candidates = [...new Set([...(data.images ?? []), ...(data.image ? [data.image] : [])])];
      const currentUrls = new Set(productImages.map((image) => image.dataUrl));
      const added = candidates.filter((url) => !currentUrls.has(url)).slice(0, Math.max(0, 5 - productImages.length));
      if (added.length === 0) {
        setReferenceMessage(productImages.length >= 5 ? "상품 이미지 5장을 모두 준비했어요." : "상품 페이지에서 추가 이미지를 찾지 못했어요. 직접 사진을 추가해 주세요.");
        return;
      }
      const nextImages = added.map((dataUrl, index) => ({ id: `remote-product-${Date.now()}-${index}`, name: `상품 페이지 이미지 ${productImages.length + index + 1}`, dataUrl }));
      setProductImages((current) => [...current, ...nextImages].slice(0, 5));
      if (!uploadedImage && nextImages[0]) {
        setUploadedImage(nextImages[0].dataUrl);
        setFileName(nextImages[0].name);
      }
      setReferenceMessage(`상품 페이지에서 ${added.length}장의 사진을 더 불러왔어요.`);
      resetProject();
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "상품 사진을 불러오지 못했어요.");
    } finally {
      setProductImagesLoading(false);
    }
  };

  const handleReferenceImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const available = 4 - referenceImages.length;
    const accepted = files.filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, available);
    if (accepted.length === 0) {
      setReferenceMessage("JPG·PNG·WEBP 이미지를 장당 8MB 이하로 올려주세요.");
      return;
    }
    try {
      const loaded = await Promise.all(accepted.map(readReferenceFile));
      setReferenceImages((current) => [...current, ...loaded].slice(0, 4));
      setReferenceMessage(`${loaded.length}장의 참고 이미지를 추가했어요.`);
      resetProject();
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "참고 이미지를 읽지 못했어요.");
    }
  };

  const removeReferenceImage = (id: string) => {
    setReferenceImages((images) => images.filter((image) => image.id !== id));
    setReferenceMessage("참고 이미지를 제거했어요.");
    resetProject();
  };

  const importProduct = async () => {
    if (!productUrl.trim()) {
      setImportStatus({ kind: "error", message: "상품 페이지 주소를 먼저 입력해주세요." });
      return;
    }
    setImporting(true);
    setImportStatus(null);
    try {
      const response = await fetch("/api/import-product", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const data = await response.json() as { error?: string; name?: string; description?: string; image?: string; images?: string[]; price?: string; originalPrice?: string; sourceUrl?: string };
      if (!response.ok) throw new Error(data.error || "상품 정보를 불러오지 못했어요.");

      const imported: string[] = [];
      if (data.name) { setProductName(data.name); imported.push("상품명"); }
      if (data.description) { setBenefit(data.description); imported.push("설명"); }
      if (data.image) {
        const gallery = [...new Set([...(data.images ?? []), data.image])].slice(0, 5).map((dataUrl, index) => ({
          id: `imported-product-${Date.now()}-${index}`,
          name: index === 0 ? "상품 페이지 대표 이미지" : `상품 페이지 이미지 ${index + 1}`,
          dataUrl,
        }));
        setUploadedImage(gallery[0]?.dataUrl ?? data.image);
        setProductImages(gallery);
        setFileName("상품 페이지 대표 이미지");
        imported.push(`이미지 ${gallery.length}장`);
      }
      if (data.originalPrice) { setNormalPrice(data.originalPrice); imported.push("정상가"); }
      if (data.price) {
        if (data.originalPrice) setSalePrice(data.price);
        else { setNormalPrice(data.price); setSalePrice(""); }
        imported.push(data.originalPrice ? "할인가" : "가격");
      }
      if (data.sourceUrl) setProductUrl(data.sourceUrl);
      setProductStarted(true);
      resetProject();
      setImportStatus({ kind: "success", message: `${imported.join(" · ")} 정보를 채웠어요. 핵심 소구점만 확인해주세요.` });
    } catch (error) {
      setImportStatus({ kind: "error", message: error instanceof Error ? error.message : "상품 정보를 불러오지 못했어요." });
    } finally {
      setImporting(false);
    }
  };

  const selectCoupangProduct = (product: DiscoveryProduct) => {
    setProjectId(null);
    setSavedAssets([]);
    setProjectStatus("draft");
    setInfoqUrl("");
    setPublishUrl("");
    setPublishedDate("");
    setNotes("");
    setSaveMessage(null);
    setSelectedProductId(product.productId);
    setProductStarted(true);
    setProductUrl(product.productUrl);
    setAffiliateUrl(product.productUrl);
    setProductName(product.productName);
    setNormalPrice(product.productPrice > 0 ? product.productPrice.toLocaleString("ko-KR") : "");
    setSalePrice("");
    if (product.productImage) {
      setUploadedImage(product.productImage);
      setProductImages([{ id: `coupang-product-${product.productId}`, name: "쿠팡 상품 대표 이미지", dataUrl: product.productImage }]);
      setFileName("쿠팡 상품 대표 이미지");
    } else {
      setUploadedImage(null);
      setProductImages([]);
    }
    setBenefit(`${product.productName}의 핵심 특징과 실제 사용 장면을 15초 안에 직관적으로 보여주세요.`);
    setHook(`${product.productName}, 요즘 인기 있는 이유`);
    resetProject();
    setImportStatus({ kind: "success", message: "상품 선택 완료! 아래 ‘다음’ 버튼을 눌러 정보를 확인해주세요." });
  };

  const resetAll = () => window.location.reload();

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <button className="logo logo-button" type="button" onClick={() => goToStep(0)} aria-label="히카리 첫 단계"><BrandMark /><span>HIKARY</span></button>
          <button className="new-project" type="button" onClick={resetAll}><span>＋</span> 새 쇼츠 만들기</button>
          <nav className="nav-list wizard-side-nav" aria-label="제작 단계">
            {wizardSteps.map((step, index) => (
              <button type="button" className={!showLibrary && currentStep === index ? "active" : ""} key={step.number} onClick={() => { setShowLibrary(false); goToStep(index); }} disabled={isStepLocked(index)}>
                <NavIcon>{index < furthestStep ? "✓" : step.number}</NavIcon>{step.title}
              </button>
            ))}
            <button type="button" className={`library-nav-button ${showLibrary ? "active" : ""}`} onClick={openLibrary}><NavIcon>▤</NavIcon>내 프로젝트</button>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="workflow-card"><span>{showLibrary ? "PROJECT LIBRARY" : `STEP ${currentStep + 1} / ${wizardSteps.length}`}</span><strong>{showLibrary ? "저장된 쇼츠 운영 현황" : wizardSteps[currentStep].title}</strong><p>{showLibrary ? "기획안·첨부 영상·게시 링크를 다시 열어 관리합니다." : "입력한 내용은 이전 단계로 돌아가도 그대로 유지됩니다."}</p></div>
          <button className="settings-link sidebar-settings" type="button" onClick={() => { setShowLibrary(false); goToStep(0); }}><NavIcon>⚙</NavIcon>쿠팡 API 설정</button>
        </div>
      </aside>

      <section className="workspace wizard-workspace">
        <header className="topbar">
          <div><p className="eyebrow"><span>AI SHORTS PLANNER</span> / {showLibrary ? "PROJECTS" : `STEP ${currentStep + 1}`}</p><h1>{showLibrary ? "내 쇼츠 프로젝트" : wizardSteps[currentStep].title}</h1></div>
          <div className="header-actions"><button className="ghost-button library-header-button" type="button" onClick={() => { if (showLibrary) setShowLibrary(false); else openLibrary(); }}>{showLibrary ? "제작 화면으로" : "내 프로젝트"}</button><a className="ghost-button flow-header-link" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">Google Flow 열기 ↗</a></div>
        </header>

        {!showLibrary && <nav className="stepper wizard-stepper" aria-label="쇼츠 제작 진행 단계">
          {wizardSteps.map((step, index) => {
            const locked = isStepLocked(index);
            return (
              <button type="button" className={`step wizard-step-button ${currentStep === index ? "current" : ""} ${index < furthestStep ? "completed" : ""}`} key={step.number} onClick={() => goToStep(index)} disabled={locked} aria-current={currentStep === index ? "step" : undefined}>
                <span>{index < furthestStep ? "✓" : step.number}</span><strong>{step.short}</strong>{index < wizardSteps.length - 1 && <i />}
              </button>
            );
          })}
        </nav>}

        <div className="studio-grid wizard-grid">
          <section className="form-panel wizard-panel" aria-live="polite">
            {showLibrary && <ProjectLibrary projects={savedProjects} loading={libraryLoading} error={libraryError} onClose={() => setShowLibrary(false)} onOpen={(project) => void openSavedProject(project)} onDelete={(project) => void deleteSavedProject(project)} />}
            {!showLibrary && currentStep === 0 && (
              <section className="wizard-stage" aria-label="1단계 상품 찾기">
                <ProductDiscovery onSelect={selectCoupangProduct} selectedProductId={selectedProductId} />
                <footer className="wizard-actions">
                  <button className="wizard-secondary" type="button" onClick={startManualEntry}>상품 직접 입력</button>
                  <button className="wizard-next" type="button" onClick={() => goToStep(1)} disabled={!productStarted}>다음 · 상품 정보 확인 <span>→</span></button>
                </footer>
              </section>
            )}

            {!showLibrary && currentStep === 1 && (
              <section className="wizard-stage" aria-labelledby="product-title">
                <div className="section-heading product-heading">
                  <div><span>02</span><h2 id="product-title">선택한 상품을 확인해주세요</h2></div>
                  <p>잘못 불러온 정보만 고치면 됩니다.</p>
                </div>

                <label className="field-label" htmlFor="product-url">상품 페이지 URL <small>직접 입력도 가능</small></label>
                <div className="url-field">
                  <span>↗</span>
                  <input id="product-url" value={productUrl} onChange={(event) => { setProductUrl(event.target.value); resetProject(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void importProduct(); } }} placeholder="쿠팡 또는 쇼핑몰 상품 링크" inputMode="url" />
                  <button type="button" onClick={() => void importProduct()} disabled={importing}>{importing ? <><span className="button-spinner" /> 읽는 중</> : "불러오기"}</button>
                </div>
                {importStatus && <div className={`import-status ${importStatus.kind}`} role="status" aria-live="polite"><span>{importStatus.kind === "success" ? "✓" : "!"}</span><p>{importStatus.message}</p></div>}

                <div className="product-form-grid selected-product-form">
                  <label className="upload-box">
                    <input type="file" accept="image/*" onChange={handleImage} />
                    <div className="product-thumb">{uploadedImage ? <img src={uploadedImage} alt="선택한 상품" /> : <span className="empty-product-image">IMG</span>}</div>
                    <span className="upload-copy"><strong>{fileName}</strong><small>Flow에 넣을 상품 기준 이미지 · 눌러서 변경</small></span><span className="replace-photo">↻</span>
                  </label>
                  <div className="field-stack">
                    <label className="field-label" htmlFor="product-name">상품명</label>
                    <input className="text-field" id="product-name" value={productName} onChange={(event) => { setProductName(event.target.value); resetProject(); }} placeholder="상품명을 입력해주세요" />
                    <div className="two-fields">
                      <label><span className="field-label">정상가</span><span className="price-input"><input value={normalPrice} onChange={(event) => { setNormalPrice(event.target.value); resetProject(); }} inputMode="numeric" /><i>원</i></span></label>
                      <label><span className="field-label">할인가</span><span className="price-input sale"><input value={salePrice} onChange={(event) => { setSalePrice(event.target.value); resetProject(); }} inputMode="numeric" placeholder="선택" /><i>원</i></span></label>
                    </div>
                  </div>
                </div>
                <label className="field-label" htmlFor="benefit">핵심 소구점</label>
                <textarea id="benefit" value={benefit} onChange={(event) => { setBenefit(event.target.value); resetProject(); }} placeholder="이 상품을 사야 하는 가장 큰 이유를 적어주세요." />
                <div className="ai-hint"><span>TIP</span> 효과를 과장하기보다 실제 사용 장면과 차별점을 구체적으로 적을수록 Flow 결과가 좋아집니다.</div>

                <footer className="wizard-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(0)}>← 이전</button>
                  <button className="wizard-next" type="button" onClick={() => goToStep(2)} disabled={!productReady}>다음 · 콘셉트 선택 <span>→</span></button>
                </footer>
              </section>
            )}

            {!showLibrary && currentStep === 2 && (
              <section className="wizard-stage concept-section" aria-labelledby="concept-title">
                <div className="section-heading"><div><span>03</span><h2 id="concept-title">어떤 느낌의 쇼츠로 만들까요?</h2></div><p>한 가지 콘셉트를 고르면 대본과 화면 구성이 달라져요.</p></div>
                <div className="concept-grid" role="radiogroup" aria-label="쇼츠 콘셉트">
                  {concepts.map((item) => <button type="button" role="radio" aria-checked={concept === item.id} className={concept === item.id ? "selected" : ""} key={item.id} onClick={() => { setConcept(item.id); resetProject(); }}><span>{item.icon}</span><p><strong>{item.name}{item.tag && <em>{item.tag}</em>}</strong><small>{item.description}</small></p><i>✓</i></button>)}
                </div>

                <div className="concept-options compact-options">
                  <div><div className="field-label">말투와 분위기</div><div className="tone-row" role="group" aria-label="영상 톤">{tones.map((item) => <button type="button" key={item} className={tone === item ? "selected" : ""} onClick={() => { setTone(item); resetProject(); }}>{item}</button>)}</div></div>
                </div>
                <div className="caption-field"><label className="field-label" htmlFor="hook">첫 3초 훅 문장 <small>후반 자막 가이드로만 사용</small></label><div><input id="hook" value={hook} onChange={(event) => { setHook(event.target.value); resetProject(); }} /><button type="button" onClick={() => { setHook(`${productName}, 요즘 인기 있는 이유`); resetProject(); }}>↻</button></div></div>
                <div className="no-text-note"><span>T</span><p><strong>Flow 영상에는 자막을 넣지 않아요</strong><small>훅 문장은 스토리보드에만 보관하고, 완성된 영상에 후반 작업으로 넣습니다.</small></p></div>

                <footer className="wizard-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(1)}>← 이전</button>
                  <button className="wizard-next" type="button" onClick={() => goToStep(3)}>다음 · Flow 제작안 <span>→</span></button>
                </footer>
              </section>
            )}

            {!showLibrary && currentStep === 3 && (
              <section className="wizard-stage" aria-label="4단계 Flow 제작안">
                <section className="reference-section" aria-labelledby="reference-title">
                  <div className="section-heading">
                    <div><span>04</span><h2 id="reference-title">상품 이미지를 준비하고 내려받으세요</h2></div>
                    <p>상품 사진 3~5장을 Flow Ingredients에 넣으면 형태를 더 정확하게 유지할 수 있어요.</p>
                  </div>

                  <div className="product-gallery-block">
                    <div className="product-gallery-head">
                      <div><strong>상품 기준 이미지</strong><span>{productImages.length} / 5장</span></div>
                      <div>
                        {productUrl && <button type="button" onClick={() => void refreshProductImages()} disabled={productImagesLoading || productImages.length >= 5}>{productImagesLoading ? "사진 찾는 중..." : "상품 페이지에서 더 찾기"}</button>}
                        <button type="button" onClick={() => void downloadAllProductImages()} disabled={productImages.length === 0}>전체 다운로드</button>
                      </div>
                    </div>
                    <div className="product-reference-grid">
                      {productImages.map((image, index) => (
                        <article className={`product-gallery-card ${index === 0 ? "primary" : ""}`} key={image.id}>
                          <div className="product-gallery-image">
                            <img src={image.dataUrl} alt={`${productName || "상품"} 기준 이미지 ${index + 1}`} />
                            <span>{index === 0 ? "MAIN" : String(index + 1).padStart(2, "0")}</span>
                          </div>
                          <div className="product-gallery-copy">
                            <b>{index === 0 ? "대표 상품 이미지" : `상품 이미지 ${index + 1}`}</b>
                            <small title={image.name}>{image.name}</small>
                            <div>
                              <button type="button" onClick={() => void downloadProductImage(image, index)}>다운로드</button>
                              {index > 0 && <button type="button" onClick={() => makePrimaryProductImage(image.id)}>대표로</button>}
                              <button className="remove" type="button" onClick={() => removeProductImage(image.id)} aria-label={`${image.name} 제거`}>삭제</button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {productImages.length < 5 && (
                        <label className="product-gallery-add">
                          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void handleProductImages(event)} />
                          <span>＋</span>
                          <b>상품 사진 추가</b>
                          <small>최대 {5 - productImages.length}장 더</small>
                        </label>
                      )}
                    </div>
                    <p className="product-gallery-note"><strong>Flow에는 준비된 상품 사진을 모두 첨부하세요.</strong> 정면·측면·구성품·사용 모습처럼 서로 다른 각도가 좋고, 첫 번째 사진은 대표 기준 이미지로 사용됩니다.</p>
                  </div>

                  <div className="mood-reference-head"><div><strong>무드 참고 이미지</strong><span>선택 · 최대 4장</span></div><p>제품이 아니라 배경·조명·카메라 분위기만 참고합니다.</p></div>
                  <div className="reference-grid mood-reference-grid">
                    {referenceImages.map((image, index) => (
                      <article className="reference-card has-image" key={image.id}>
                        <img src={image.dataUrl} alt={`Flow 무드 참고 이미지 ${index + 1}`} />
                        <span className="reference-card-copy"><b>무드 참고 {index + 1}</b><small title={image.name}>{image.name}</small></span>
                        <button type="button" onClick={() => removeReferenceImage(image.id)} aria-label={`${image.name} 제거`}>×</button>
                      </article>
                    ))}
                    {referenceImages.length < 4 && (
                      <label className="reference-card add-reference">
                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void handleReferenceImages(event)} />
                        <span className="reference-placeholder">＋</span>
                        <span className="reference-card-copy"><b>참고 이미지 추가</b><small>최대 {4 - referenceImages.length}장 더</small></span>
                      </label>
                    )}
                  </div>
                  <div className="reference-help"><span>TIP</span><p><strong>상품 사진은 제품 고정용, 무드 이미지는 연출 참고용으로 구분하세요.</strong> 프롬프트에도 모든 상품 사진을 최우선 기준으로 삼고 제품의 형태·색상·로고·구성품을 바꾸지 않도록 명시됩니다.</p></div>
                  {referenceMessage && <p className="reference-message" role="status">{referenceMessage}</p>}
                </section>

                <div className="divider" />
                <FlowPromptStudio key={`${projectRevision}-${projectId ?? "new"}`} productName={productName} productImage={uploadedImage} productImages={productImages} benefit={benefit} price={`${salePrice || normalPrice}${salePrice || normalPrice ? "원" : ""}`} hook={hook} tone={tone} concept={concept} referenceImages={referenceImages} initialProject={flowProject} onGenerated={(project) => { setFlowProject(project); setProjectStatus((status) => status === "draft" ? "planning" : status); }} />

                <footer className="wizard-actions final-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(2)}>← 콘셉트 수정</button>
                  <button className="wizard-next" type="button" onClick={() => void savePlanningAndContinue()} disabled={!flowProject || savingProject}>{savingProject ? "기획안 저장 중..." : "기획안 저장하고 5단계"} <span>→</span></button>
                </footer>
              </section>
            )}

            {!showLibrary && currentStep === 4 && flowProject && (
              <section className="wizard-stage" aria-label="5단계 영상·게시 관리">
                <PostProductionPackage project={flowProject} productName={productName} />

                <div className="divider" />
                <PublishingManager projectId={projectId} status={projectStatus} affiliateUrl={affiliateUrl} infoqUrl={infoqUrl} publishUrl={publishUrl} publishedDate={publishedDate} notes={notes} assets={savedAssets} pendingVideo={pendingVideo} saving={savingProject} message={saveMessage} onStatus={setProjectStatus} onAffiliateUrl={setAffiliateUrl} onInfoqUrl={setInfoqUrl} onPublishUrl={setPublishUrl} onPublishedDate={setPublishedDate} onNotes={setNotes} onVideo={setPendingVideo} onSave={() => void saveCurrentProject()} onDeleteAsset={(asset) => void deleteSavedAsset(asset)} onOpenLibrary={openLibrary} />

                <footer className="wizard-actions final-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(3)}>← 콘티·프롬프트 수정</button>
                  <button className="wizard-secondary" type="button" onClick={openLibrary}>저장된 프로젝트 보기</button>
                </footer>
              </section>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
