import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import { QuickRouteForm } from "~/components/journey/QuickRouteForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export default function RouteBuilder() {
  const navigate = useNavigate();
  const { current, intercepts, customerPosition } = useJourney();

  const origin = current ? { lat: current.originLat, lng: current.originLng } : null;
  const destination = current ? { lat: current.destinationLat, lng: current.destinationLng } : null;

  const onSuccess = useCallback(() => {
    if (useJourney.getState().intercepts.length > 0) {
      navigate("/intercepts");
    }
  }, [navigate]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold">Plan your journey</h1>
        <p className="text-sm text-text-secondary mt-1">
          Live Google Maps routing with vehicle details, optional GPS sharing, and intercept scoring.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass border-border-subtle order-2 lg:order-1">
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
            <CardDescription>
              Add plate numbers, train info, and enable live location for intercept sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuickRouteForm datalistId="rb-route-places" onSuccess={onSuccess} />
            {current && intercepts.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => navigate("/intercepts")}
              >
                Continue to intercepts
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="order-1 lg:order-2">
          <JourneyMap
            origin={origin}
            destination={destination}
            routePoints={current?.routePoints}
            intercepts={intercepts}
            customerPosition={customerPosition}
            heightClassName="h-[360px] lg:h-full min-h-[360px]"
          />
        </div>
      </div>
    </div>
  );
}
