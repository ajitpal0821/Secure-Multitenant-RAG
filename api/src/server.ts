
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
    console.log("--------------------------------");
    console.log("Secure Multi-Tenant RAG API");
    console.log("--------------------------------");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Mode: ${process.env.SECURITY_MODE || "vulnerable"}`);
    console.log("--------------------------------");
});
