import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { FileText, Share2, Calendar, Smile, Meh, ChevronRight, Loader2 } from "lucide-react";
const MOOD_CONFIG = {
    calm: { icon: Smile, label: "Calm & Relaxed", color: "text-green-700", bg: "bg-green-100" },
    cooperative: { icon: Smile, label: "Cooperative", color: "text-blue-700", bg: "bg-blue-100" },
    anxious: { icon: Meh, label: "Anxious", color: "text-amber-700", bg: "bg-amber-100" },
    wiggly: { icon: Meh, label: "Wiggly", color: "text-purple-700", bg: "bg-purple-100" },
};
export function ReportCards() {
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedCard, setSelectedCard] = useState(null);
    useEffect(() => {
        const fetchReportCards = async () => {
            try {
                const response = await fetch("/api/portal/appointments");
                if (response.ok) {
                    const data = await response.json();
                    const allAppointments = data.appointments || data || [];
                    const reportCardAppointments = allAppointments.filter((appt) => appt.reportCardId);
                    setAppointments(reportCardAppointments);
                }
                else {
                    setError("Failed to load report cards.");
                }
            }
            catch {
                setError("Failed to load report cards. Please try again.");
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchReportCards();
    }, []);
    if (isLoading) {
        return (_jsxs("div", { className: "flex items-center justify-center py-12", children: [_jsx(Loader2, { className: "animate-spin text-stone-400", size: 24 }), _jsx("span", { className: "ml-3 text-stone-500", children: "Loading report cards..." })] }));
    }
    if (error) {
        return (_jsxs("div", { className: "text-center py-12", children: [_jsx("p", { className: "text-red-600 mb-4", children: error }), _jsx("button", { onClick: () => window.location.reload(), className: "px-4 py-2 bg-stone-100 text-stone-700 rounded-md hover:bg-stone-200", children: "Retry" })] }));
    }
    if (appointments.length === 0) {
        return (_jsxs("div", { className: "text-center py-12", children: [_jsx("div", { className: "w-16 h-16 mx-auto mb-4 rounded-full bg-stone-100 flex items-center justify-center", children: _jsx(FileText, { size: 24, className: "text-stone-400" }) }), _jsx("h3", { className: "text-lg font-medium text-stone-800 mb-1", children: "No Report Cards Yet" }), _jsx("p", { className: "text-sm text-stone-500", children: "Report cards from your grooming visits will appear here after your appointments." })] }));
    }
    if (selectedCard) {
        return _jsx(ReportCardDetail, { card: selectedCard, onBack: () => setSelectedCard(null) });
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("p", { className: "text-sm text-stone-500", children: "Grooming report cards from your recent visits" }), _jsx("div", { className: "space-y-4", children: appointments.map((card) => {
                    const moodKey = "cooperative";
                    const mood = MOOD_CONFIG[moodKey];
                    const MoodIcon = mood.icon;
                    return (_jsx("button", { onClick: () => setSelectedCard(card), className: "w-full bg-white rounded-2xl border border-stone-200 p-5 shadow-sm text-left hover:border-stone-300 transition-colors", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "w-14 h-14 rounded-xl bg-(--color-accent-light) flex items-center justify-center text-(--color-accent)", children: _jsx(FileText, { size: 24 }) }), _jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("h3", { className: "font-semibold text-stone-800", children: [card.petName || "Pet", "'s Report Card"] }), _jsx(ChevronRight, { size: 16, className: "text-stone-400" })] }), _jsxs("p", { className: "text-sm text-stone-500 mt-0.5", children: [card.serviceName || "Grooming", " with ", card.groomerName || "your groomer"] }), _jsxs("div", { className: "flex items-center gap-3 mt-2", children: [_jsxs("span", { className: "flex items-center gap-1 text-xs text-stone-400", children: [_jsx(Calendar, { size: 12 }), new Date(card.date).toLocaleDateString("en-US", {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        })] }), _jsxs("span", { className: `flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${mood.bg} ${mood.color}`, children: [_jsx(MoodIcon, { size: 12 }), mood.label] })] })] })] }) }, card.id));
                }) })] }));
}
function ReportCardDetail({ card, onBack }) {
    const moodKey = "cooperative";
    const mood = MOOD_CONFIG[moodKey];
    const MoodIcon = mood.icon;
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("button", { onClick: onBack, className: "text-sm text-(--color-accent-dark) font-medium hover:underline", children: "Back to Report Cards" }), _jsxs("div", { className: "bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden", children: [_jsxs("div", { className: "bg-gradient-to-r from-(--color-accent-lighter) to-(--color-accent-light) p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsxs("h2", { className: "text-xl font-semibold text-stone-800", children: [card.petName || "Pet", "'s Grooming Report"] }), _jsxs("button", { className: "flex items-center gap-1.5 px-3 py-1.5 bg-white/80 text-stone-700 rounded-lg text-sm font-medium hover:bg-white", children: [_jsx(Share2, { size: 14 }), "Share"] })] }), _jsxs("p", { className: "text-sm text-stone-600", children: [new Date(card.date).toLocaleDateString("en-US", {
                                        weekday: "long",
                                        month: "long",
                                        day: "numeric",
                                        year: "numeric",
                                    }), card.groomerName ? ` · Groomer: ${card.groomerName}` : ""] })] }), _jsxs("div", { className: "p-6 space-y-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-medium text-stone-800 mb-3", children: "Before & After" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [_jsxs("div", { className: "rounded-xl bg-stone-50 p-4", children: [_jsx("p", { className: "text-xs font-medium text-stone-400 uppercase mb-2", children: "Before" }), _jsx("div", { className: "w-full h-32 bg-stone-200 rounded-lg flex items-center justify-center text-stone-400 text-sm mb-2", children: "Photo placeholder" }), _jsx("p", { className: "text-sm text-stone-600", children: "Before photo description not available." })] }), _jsxs("div", { className: "rounded-xl bg-(--color-accent-lighter) p-4", children: [_jsx("p", { className: "text-xs font-medium text-(--color-accent) uppercase mb-2", children: "After" }), _jsx("div", { className: "w-full h-32 bg-(--color-accent-light) rounded-lg flex items-center justify-center text-(--color-accent) text-sm mb-2", children: "Photo placeholder" }), _jsx("p", { className: "text-sm text-stone-700", children: "After photo description not available." })] })] })] }), _jsxs("div", { children: [_jsx("h3", { className: "font-medium text-stone-800 mb-2", children: "Services Performed" }), _jsx("div", { className: "flex flex-wrap gap-2", children: _jsx("span", { className: "px-3 py-1 bg-stone-100 rounded-full text-sm text-stone-700", children: card.serviceName || "Grooming" }) })] }), _jsxs("div", { children: [_jsx("h3", { className: "font-medium text-stone-800 mb-2", children: "Behavior & Mood" }), _jsxs("div", { className: `inline-flex items-center gap-2 px-4 py-2 rounded-xl ${mood.bg}`, children: [_jsx(MoodIcon, { size: 20, className: mood.color }), _jsx("span", { className: `font-medium ${mood.color}`, children: mood.label })] })] }), _jsxs("div", { className: "bg-(--color-accent-lighter) rounded-xl p-4", children: [_jsxs("h3", { className: "font-medium text-stone-800 mb-2", children: ["A Note from ", card.groomerName || "Your Groomer"] }), _jsx("p", { className: "text-sm text-stone-700 italic leading-relaxed", children: "\"Report card details are not yet available. Please check back after your visit.\"" })] }), _jsxs("div", { className: "bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-stone-800", children: "Book your next visit" }), _jsx("p", { className: "text-xs text-stone-500", children: "Schedule your next grooming appointment" })] }), _jsx("button", { onClick: () => {
                                // TODO: Pre-select the service from report card (serviceId/serviceName) once BookPage supports service pre-selection via URL param
                                const params = new URLSearchParams();
                                if (card.petName) params.set("petName", card.petName);
                                if (card.serviceName) params.set("serviceName", card.serviceName);
                                window.location.href = `/admin/book${params.size > 0 ? `?${params.toString()}` : ""}`;
                            }, className: "px-4 py-2 bg-(--color-accent) text-white rounded-lg text-sm font-medium hover:bg-(--color-accent-hover)", children: "Rebook Now" })] })] })] })] }));
}