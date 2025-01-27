import { HEADER } from "@std/http/unstable-header";
import { panic } from "../common/fp/runtime/executor.ts";

type FormParseOptions = {
	uploadDir: string;
	keepExtensions: boolean;
	maxFieldsSize: number;
};

const MULTIPART = "multipart/form-data";
const JSON = "application/json";

export const processRequestData = async (request: Request, options: FormParseOptions) => {
	const files = {};
	let fields: Record<string, string> = {};

	const contentType = request.headers.get(HEADER.ContentType);
	if (!contentType) {
		throw new Error("missing Content-Type header");
	}

	if (contentType.startsWith(MULTIPART)) {
		const formData = await request.formData();

		for (const [identifier, value] of formData.entries()) {
			if (value instanceof File) {
				panic("needs implementation");
			} else {
				fields[identifier] = value;
			}
		}
	} else if (contentType.startsWith(JSON)) {
		fields = await request.json();
	}

	return { fields, files };
};
