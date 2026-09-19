export function normalizeChatId(id: number | string): string {
    const str = id.toString();
    if (str.startsWith("-100")) return str;
    if (str.startsWith("-")) return `-100${str.slice(1)}`;
    return `-100${str}`;
}