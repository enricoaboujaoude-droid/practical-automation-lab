import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/app${url.search}`,
    },
  });
};

export default function IndexRoute() {
  return null;
}
