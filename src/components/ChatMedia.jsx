import { useEffect, useRef, useState } from "react";
import "./ChatMedia.css";

export function useLocalMediaDrafts({
	maxItems = 4,
	maxVideoBytes = 250 * 1024 * 1024,
	maxImageBytes = 20 * 1024 * 1024,
} = {}) {
	const objectUrlsRef = useRef(new Set());
	const [attachments, setAttachments] = useState([]);
	const [error, setError] = useState("");

	useEffect(
		() => () => {
			objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
		},
		[],
	);

	function addFiles(files) {
		setError("");
		const availableSlots = Math.max(0, maxItems - attachments.length);
		if (!availableSlots) {
			setError("Send or remove an attachment before adding more.");
			return;
		}

		const nextAttachments = [];
		for (const file of files.slice(0, availableSlots)) {
			const kind = file.type.startsWith("video/")
				? "video"
				: file.type.startsWith("image/")
					? "image"
					: null;
			if (!kind) {
				setError("Choose a photo or video file.");
				continue;
			}
			const maxBytes = kind === "video" ? maxVideoBytes : maxImageBytes;
			if (file.size > maxBytes) {
				setError(
					kind === "video"
						? `Videos can be up to ${Math.round(maxVideoBytes / 1024 / 1024)} MB.`
						: `Photos can be up to ${Math.round(maxImageBytes / 1024 / 1024)} MB.`,
				);
				continue;
			}

			const url = URL.createObjectURL(file);
			objectUrlsRef.current.add(url);
			nextAttachments.push({
				id: `media-${Date.now()}-${nextAttachments.length}-${file.size}`,
				kind,
				name: file.name || (kind === "video" ? "Recorded video" : "Photo"),
				size: file.size,
				mimeType: file.type,
				url,
				status: "local-preview",
			});
		}

		if (files.length > availableSlots) {
			setError(`You can attach up to ${maxItems} items.`);
		}
		if (nextAttachments.length) {
			setAttachments((current) => [...current, ...nextAttachments]);
		}
	}

	function removeAttachment(attachmentId) {
		setAttachments((current) => {
			const attachment = current.find((item) => item.id === attachmentId);
			if (attachment) {
				URL.revokeObjectURL(attachment.url);
				objectUrlsRef.current.delete(attachment.url);
			}
			return current.filter((item) => item.id !== attachmentId);
		});
		setError("");
	}

	function detachAttachments() {
		const detached = attachments;
		setAttachments([]);
		setError("");
		return detached;
	}

	function clearAttachments() {
		attachments.forEach((attachment) => {
			URL.revokeObjectURL(attachment.url);
			objectUrlsRef.current.delete(attachment.url);
		});
		setAttachments([]);
		setError("");
	}

	return {
		attachments,
		error,
		addFiles,
		removeAttachment,
		detachAttachments,
		clearAttachments,
	};
}

function MediaReviewDialog({ attachment, onClose }) {
	const reviewRef = useRef(null);
	const videoRef = useRef(null);
	const [zoom, setZoom] = useState(1);
	const [playbackRate, setPlaybackRate] = useState(1);

	useEffect(() => {
		setZoom(1);
		setPlaybackRate(1);
	}, [attachment]);

	useEffect(() => {
		if (!attachment) return undefined;
		const handleKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [attachment, onClose]);

	if (!attachment) return null;

	function seek(seconds) {
		if (!videoRef.current) return;
		videoRef.current.currentTime = Math.max(
			0,
			Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + seconds),
		);
	}

	function changePlaybackRate(event) {
		const nextRate = Number(event.target.value);
		setPlaybackRate(nextRate);
		if (videoRef.current) videoRef.current.playbackRate = nextRate;
	}

	function toggleFullscreen() {
		reviewRef.current?.requestFullscreen?.();
	}

	return (
		<div
			className="media-review-backdrop"
			role="dialog"
			aria-modal="true"
			aria-label={`Review ${attachment.name}`}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section ref={reviewRef} className="media-review-dialog">
				<header className="media-review-header">
					<div>
						<strong>Form review</strong>
						<span title={attachment.name}>{attachment.name}</span>
					</div>
					<button type="button" onClick={onClose} aria-label="Close media review">×</button>
				</header>

				<div className="media-review-viewport">
					{attachment.kind === "video" ? (
						<video
							ref={videoRef}
							src={attachment.url}
							controls
							playsInline
							preload="metadata"
							style={{ width: `${zoom * 100}%` }}
						/>
					) : (
						<img
							src={attachment.url}
							alt={attachment.name}
							style={{ width: `${zoom * 100}%` }}
						/>
					)}
				</div>

				<footer className="media-review-toolbar">
					{attachment.kind === "video" ? (
						<>
							<button type="button" onClick={() => seek(-10)}>↶ 10s</button>
							<button type="button" onClick={() => seek(10)}>10s ↷</button>
							<label>
								<span>Speed</span>
								<select value={playbackRate} onChange={changePlaybackRate}>
									<option value="0.25">0.25×</option>
									<option value="0.5">0.5×</option>
									<option value="0.75">0.75×</option>
									<option value="1">1×</option>
									<option value="1.5">1.5×</option>
									<option value="2">2×</option>
								</select>
							</label>
						</>
					) : null}
					<button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>−</button>
					<span className="media-zoom-value">{Math.round(zoom * 100)}%</span>
					<button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>＋</button>
					<button type="button" onClick={toggleFullscreen}>Fullscreen</button>
				</footer>
			</section>
		</div>
	);
}

export function MessageMediaGallery({ attachments }) {
	const [reviewAttachment, setReviewAttachment] = useState(null);

	if (!attachments?.length) return null;

	return (
		<>
			<div className="message-media-gallery">
				{attachments.map((attachment) => (
					<button
						key={attachment.id}
						type="button"
						className="message-media-tile"
						onClick={() => setReviewAttachment(attachment)}
						aria-label={`Review ${attachment.name}`}
					>
						{attachment.kind === "video" ? (
							<video src={attachment.url} muted playsInline preload="metadata" />
						) : (
							<img src={attachment.url} alt="" />
						)}
						<span className="message-media-overlay">
							{attachment.kind === "video" ? "▶ Review video" : "⌕ Review photo"}
						</span>
					</button>
				))}
			</div>
			<MediaReviewDialog
				attachment={reviewAttachment}
				onClose={() => setReviewAttachment(null)}
			/>
		</>
	);
}

export function MediaDraftTray({ attachments, onRemove }) {
	if (!attachments.length) return null;

	return (
		<div className="media-draft-tray" aria-label="Media ready to send">
			{attachments.map((attachment) => (
				<div key={attachment.id} className="media-draft-item">
					{attachment.kind === "video" ? (
						<video src={attachment.url} muted playsInline preload="metadata" />
					) : (
						<img src={attachment.url} alt="" />
					)}
					<span>{attachment.kind === "video" ? "Video" : "Photo"}</span>
					<button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>×</button>
				</div>
			))}
		</div>
	);
}

export function MediaPickerButton({ onFiles }) {
	const pickerRef = useRef(null);
	const libraryInputRef = useRef(null);
	const recordingInputRef = useRef(null);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		if (!menuOpen) return undefined;
		const handlePointerDown = (event) => {
			if (!pickerRef.current?.contains(event.target)) setMenuOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [menuOpen]);

	function handleInput(event) {
		onFiles(Array.from(event.target.files || []));
		event.target.value = "";
		setMenuOpen(false);
	}

	return (
		<div ref={pickerRef} className="media-picker">
				<button
					type="button"
					className="media-attach-button"
					onClick={() => setMenuOpen((open) => !open)}
					aria-label="Attach a photo or video"
					aria-expanded={menuOpen}
				>
					＋
				</button>
				{menuOpen ? (
					<div className="media-picker-menu">
						<button type="button" onClick={() => recordingInputRef.current?.click()}>
							<strong>Record video</strong>
							<span>Use your phone camera</span>
						</button>
						<button type="button" onClick={() => libraryInputRef.current?.click()}>
							<strong>Photo or video</strong>
							<span>Choose from your library</span>
						</button>
					</div>
				) : null}
				<input
					ref={recordingInputRef}
					type="file"
					accept="video/*"
					capture="environment"
					onChange={handleInput}
					hidden
				/>
				<input
					ref={libraryInputRef}
					type="file"
					accept="image/*,video/*"
					multiple
					onChange={handleInput}
					hidden
				/>
		</div>
	);
}
