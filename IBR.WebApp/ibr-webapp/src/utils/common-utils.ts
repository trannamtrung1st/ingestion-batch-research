export const readFileAsString = async (file: File) => {
    const promise = new Promise<string | undefined | null>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileContent = e.target?.result as string;
            resolve(fileContent);
        };
        reader.onerror = (e) => {
            reject(e);
        };
        reader.readAsText(file);
    })
    return promise;
}