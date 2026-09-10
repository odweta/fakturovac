// const request = require("supertest");
// const app = require("../src/app");

// describe("GET /search", () => {
//   afterEach(() => {
//     jest.restoreAllMocks();
//   });

//   test("returns 400 when query is missing", async () => {
//     const response = await request(app).get("/search");

//     expect(response.status).toBe(400);
//     expect(response.text).toBe("Missing search query");
//   });

//   test("returns filtered search results", async () => {
//     global.fetch = jest.fn().mockResolvedValue({
//       json: jest.fn().mockResolvedValue({
//         results: [
//           {
//             url: "https://example.com",
//             title: "Example",
//             content: "Content",
//             irrelevant: "removed"
//           }
//         ]
//       })
//     });

//     const response = await request(app)
//       .get("/search")
//       .query({ query: "nodejs" });

//     expect(response.status).toBe(200);
//     expect(response.headers["content-type"]).toMatch(/application\/json/);
//     expect(response.headers["content-disposition"]).toContain(
//       'attachment; filename="output.json"'
//     );

//     expect(response.body).toEqual([
//       {
//         url: "https://example.com",
//         title: "Example",
//         content: "Content"
//       }
//     ]);
//   });
// });
